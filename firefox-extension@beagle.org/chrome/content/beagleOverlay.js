/*
 * Beagle Extension: Index webpages you visit using the Beagle Indexing Engine.
 * An Extension for the Firefox  Browser.
 */


var beagle = {};

//some constant 
beagle.RUN_BEAGLE_NOT_FOUND = -1;
beagle.RUN_INITED = 0;
beagle.RUN_ENABLED = 1;
beagle.RUN_DISABLED = 2;
beagle.RUN_ERROR = 3;


beagle.pref = beaglePref;

var gEnv = Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment);

// Load jslib parts used in file execution
var gFile = new FileUtils();


/*
 * init beagle, init status, init pathes .....
 * we will NOT get the prefs as it might be changed after init
 * we will get the prefs when we need it.
 */
beagle.init = function()
{
    if(!this.checkEnv())
    {
        this.runStatus = this.RUN_BEAGLE_NOT_FOUND;
        this.error(_("beagle_not_found"));
        return ;
    }
    else
    {
        if(this.pref.load()['beagle.enable'])
        {
            this.enable();
        }
        else
        {
            this.disable();
        }
        this.dataPath = gEnv.get("HOME") + "/.beagle/ToIndex";  
        if(!gFile.exists(this.dataPath))
            ;// do something here ? is it safe to create the dir ?
        this.addEventListener();
    }
}

beagle.addEventListener = function (){
   // Add listener for page loads
  if (document.getElementById("appcontent"))
    document.getElementById("appcontent").addEventListener("load", 
                                                           beaglePageLoad, 
                                                           true);
}

beagle.checkEnv = function()
{
    if (!gFile.exists (gEnv.get("HOME") + "/.beagle")) {
        alert("Not Found ~/.beagle folder. This extension will not work");
        return false;
    }
    return true;
}


/*
 * check weather the url should index
 * return true if it need to index
 */
beagle.shouldIndex = function(page)
{
    var prefObject = this.pref.load();
    
    //check https
    if (page.location.protocol == "https:" && !prefObject['beagle.security.active'])
    {
        return false;
    }
    var lists = ['beagle.exclude.list','beagle.include.list'];
    var flags = [false,false];
    for(var j = 0; j < 2; j++)
    {
        var list = prefObject[lists[j]].parseJSON();
        var len = list.length;
        var flag = false;
        for(var i = 0; i < len && !flag; i++)
        {
            switch(excludeList[i]['patternType'])
            {
            case 'domain':
                //what means a domain matches
                //www.google.com matches google.com and matches .com
                //www.agoogle.com NOT matches google.com but matches com
                //www.com.google. NOT matches .com 
                var hostname = page.location.hostname;
                var pattern = list[i]['pattern'];
                if (pattern[0] != '.')
                    pattern = "." + pattern;
                flag = hostname.isEndWith(pattern)
                break;
            case 'wildcard':
                var re =  RegExp(list[i]['pattern'].wilcard2RE());
                flag = (page.location.href.match(re) != null);
                break;
            case 'regular expression':
                var re = RegExp(list[i]['pattern']);
                flag = (page.location.href.match(re) != null)
                break;
            default:
                //something wrong;
                break;
            }
        }
        flags[j] = flag;
    }
    if(!flags[0] && !flags[1])
        return prefObject['beagle.default.action'] == 1;
    if(flags[0] && flags[1])
        return prefObject['beagle.conflict.action'] == 1;
    return flags[1];

}



function beagleInit()
{
  dump ("beagleInit started!\n");

  gBeagleBestPath = beagleFindFileInPath("beagle-search");

  dump ("beagleInit: Found beagle-search: " + gBeagleBestPath + "\n");

  // Create eventlistener to trigger when context menu is invoked.
  if (gBeagleBestPath) {
    try {
      document.getElementById('contentAreaContextMenu').addEventListener('popupshowing',
								         beagleContext,
								         false);
    } catch(e) {
      alert(e);
    }
  }

  // Get the global enable/disable pref
  try { bPref = gPref.getBoolPref('beagle.enabled'); }
  catch(e) { bPref = true }

  if (bPref)
    gBeagleRunStatus = 0;
  else
    gBeagleRunStatus = -1;

  // Add listener for page loads
  if (document.getElementById("appcontent"))
    document.getElementById("appcontent").addEventListener("load", 
                                                           beaglePageLoad, 
                                                           true);
  dump ("beagleInit : Listening to document['appcontent'].load\n");

  beagleUpdateStatus ();
}

/**
 *@see http://www.xulplanet.com/references/xpcomref/comps/c_embeddingbrowsernsWebBrowserPersist1.html
 */
beagle.getPersisitMask()
{
    if(this.PERSISIT_MASK != undefined)
        return this.PERSISIT_MASK;
    var comp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"];
    this.PERSIST_MASK = (comp.PERSIST_FLAGS_FROM_CACHE | 
		    comp.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
		    comp.PERSIST_FLAGS_NO_BASE_TAG_MODIFICATIONS |
		    comp.PERSIST_FLAGS_DONT_FIXUP_LINKS |
		    comp.PERSIST_FLAGS_DONT_CHANGE_FILENAMES |
		    comp.PERSIST_FLAGS_CLEANUP_ON_FAILURE);
    return this.PERSISIT_MASK;
}

beagle.getEncodeMask()
{
    if(this.ENCODE_MASK != undefined)
        return this.ENCODE_MASK;
    var comp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"];
    this.ENCODE_MASK = (comp.ENCODE_FLAGS_RAW | comp.ENCODE_FLAGS_ABSOLUTE_LINKS);
    return this.ENOCDE_MASK;
}

/**
 write page content (NOT the HTML source, the DOM instead, it may include dym contnent created by js)
*/
beagle.writeContent(page, tmpfilepath)
{
  var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
  tmpfile.initWithPath(tmpfilepath);

  var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
  persist.persistFlags = this.getPersisitMask();

  persist.saveDocument(page, tmpfile, null, null, this.getEncodeMask(), 0);
}

/**
 write meatadata  (include URI hittype mimetype characterset etc)
*/
beagle.writeMetadata = function(page, tmpfilepath)
{
  var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
  tmpfile.initWithPath(tmpfilepath);

  var stream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
  stream.QueryInterface(Components.interfaces.nsIOutputStream);
  stream.init(tmpfile, 0x04 | 0x08 | 0x20, 0600, 0);

  var line;

  // First line: URI
  line = page.location.href + "\n";
  stream.write(line, line.length);
  
  // Second line: Hit Type
  line = "WebHistory\n";
  stream.write(line, line.length);

  // Third line: Mime type
  //may be should use page.contentType
  //line = "text/html\n";
  line = page.contentType + "\n";
  stream.write(line, line.length);

  // Additional lines: Properties
  line = "k:_unindexed:encoding=" + page.characterSet + "\n";
  stream.write(line, line.length);

  stream.flush();
  stream.close();
}

beagle.onPageLoad = function(event)
{ 
    var page = event.originalTarget;
    if (!this.shouldIndex(page))
        return;
    
    //save file content and metadats
    var hash = hex_md5(page.location.href);
    var tmpdatapath = gBeagleDataPath + "/firefox-beagle-" + hash + ".html";
    var tmpmetapath = gBeagleDataPath + "/.firefox-beagle-" + hash + ".html";
        
    try {
        beagleWriteContent(page, tmpdatapath);
        beagleWriteMetadata(page, tmpmetapath);
    } catch (ex) {
        alert ("beaglePageLoad: beagleWriteContent/Metadata failed: " + ex);
    }
}

beagle.disable = function()
{
    var icon = document.getElementById('beagle-notifier-status');
    icon.setAttribute("status","00f");
    icon.setAttribute("tooltiptext",_("beagle_tooptip_disabled");

    this.pref.load();
    this.pref.prefObject["beagle.enabled"] = false;
    this.pref.save();

    this.runStatus = this.RUN_DISABLED;
}

beagle.enable = function()
{
    var icon = document.getElementById('beagle-notifier-status');
    icon.setAttribute("status","000");
    icon.setAttribute("tooltiptext",_("beagle_tooptip_actived");

    this.pref.load();
    this.pref.prefObject["beagle.enabled"] = true;
    this.pref.save();

    this.runStatus = this.RUN_ENABLED;
}
beagle.error = function(msg)
{
    var icon = document.getElementById('beagle-notifier-status');
    icon.setAttribute("status","f00");
    icon.setAttribute("tooltiptext",_f("beagle_tooptip_error",msg);

    this.pref.load();
    this.pref.prefObject["beagle.enabled"] = false;
    this.pref.save();

    this.runStatus = this.RUN_ERROR;
}

beagle.showPrefs = function()
{
  window.openDialog('chrome://newbeagle/content/beaglePrefs.xul',
		    'PrefWindow',
		    'chrome,modal=yes,resizable=no',
		    'browser');
}

beagel.onIconClick = function(event)
{
    // Right-click event.
    if (event.button == 2) {
        //beagleShowPrefs();
        return;
    }
    if (event.button == 0 && event.ctrlKey)
    {
        //beagleShowPrefs();
        return;
    }
    // Left-click event (also single click, like Mac).
    if (event.button == 0 && event.ctrlKey == 0) {
        switch(this.runStatus)
        {
        case this.RUN_ENABLED:
            // currently enabled. disable 
            this.disable();
            break;
        case this.RUN_DISABLED:
            // currently disabled  enable.
            this.enable();
            break;
        default:
            // last run was an error, show the error
            //alert("Error running Beagle Indexer: " + this.RunStatus);
            break;
        }
    }
}

// Create event listener.
window.addEventListener('load', beagle.init, false); 

// Right-click context menu
function beagleContext()
{
  var bPref;

  // Find context menu display preference.
  try      { bPref = gPref.getBoolPref('beagle.context.active'); }
  catch(e) { }

  // Set hidden property of context menu and separators.
  document.getElementById('beagle-context-menu').hidden = !(bPref);
  document.getElementById('beagle-context-sep-a').hidden = !(bPref);
  document.getElementById('beagle-context-sep-b').hidden = !(bPref);

  // If not displaying context menu, return.
  if (!bPref) return;

  // Separator A (top) display preference.
  try      { bPref = gPref.getBoolPref('beagle.context.sep.a'); }
  catch(e) { bPref = false }
  document.getElementById('beagle-context-sep-a').hidden = !(bPref);

  // Separator B (bottom) display preference.
  try      { bPref = gPref.getBoolPref('beagle.context.sep.b'); }
  catch(e) { bPref = false }
  document.getElementById('beagle-context-sep-b').hidden = !(bPref);

  // Should search link item be hidden or shown?
  document.getElementById('beagle-context-search-link').hidden = !(gContextMenu.onLink);

  // Should text search item be hidden or shown?
  document.getElementById('beagle-context-search-text').hidden = !(gContextMenu.isTextSelected);
  document.getElementById('beagle-context-search-text').setAttribute("label","Search for \"" + gContextMenu.searchSelected() + "\"");
}

