/*
 * Beagle Extension: Index webpages you visit using the Beagle Indexing Engine.
 * An Extension for the Firefox  Browser.
 */


var beagle = new Object();

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

//tasks (add a task when index link, and remove it after finish index )
beagle.tasks = [];

/*
 * init beagle, init status, init pathes .....
 * we will NOT get the prefs as it might be changed after init
 * we will get the prefs when we need it.
 */
beagle.init = function()
{
    dump("beagle init ");
    if(!this.checkEnv())
    {
        this.runStatus = this.RUN_BEAGLE_NOT_FOUND;
        this.error(_("beagle_not_found"));
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
    }
    this.addEventListener();
}

beagle.addEventListener = function ()
{
    // Add listener for page loads
    if (this.runStatus != this.RUN_BEAGLE_NOT_FOUND && document.getElementById("appcontent"))
        document.getElementById("appcontent").addEventListener("load",beaglePageLoad,true);
    document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", function(e){ beagle.initContextMenu(e);}, false);

    //document.getElementById('beagle-notifier-status').onmouseup = function(event){ bealge.onIconClick(event);};
}

beagle.initContextMenu = function (e)
{
    if(e.originalTarget.id != "contentAreaContextMenu")
        return;
    //dump("[beagle] gContextMenu " + gContextMenu + "\n");
    gContextMenu.showItem("context-index-this-link", gContextMenu.onLink && !gContextMenu.onMailtoLink); 
    gContextMenu.showItem("context-index-this-image", gContextMenu.onImage && gContextMenu.onLoadedImage); 
    //gContextMenu.showItem("context-index-this", ); 
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
Check the page, 
1. the protocal (We will NOT index about:* file:///* )
2. check is the page  itself 
*/
beagle.checkPage = function(page)
{
    if (!page)
    {
        dump("[beagle checkPage ] the page doesn't seems to be a page\n");
        return false;
    } 
    if (!page.location ||
        !page.location.href ||
        page.location.href.indexOf("about:") == 0 ||
        page.location.href.indexOf("file:") == 0 )
    {
        dump("[beagle checkPage ] strage page " + page + "\n");
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
    if(!this.checkPage(page))
        return false;

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
            switch(list[i]['patternType'])
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
                flag = hostname.isEndWith(pattern) || (hostname == list[i]['pattern']);
                dump("[beagle check domain] is " + hostname + " end with " + pattern +" ? " + flag + "\n");
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
    dump("[beagle] [Should Index ? ] [exclude = "+flags[0] + "] [include = " + flags[1] + "]\n");
    if(!flags[0] && !flags[1])
        return prefObject['beagle.default.action'] == 1;
    if(flags[0] && flags[1])
        return prefObject['beagle.conflict.action'] == 1;
    return flags[1];

}



/**
 *@see http://www.xulplanet.com/references/xpcomref/comps/c_embeddingbrowsernsWebBrowserPersist1.html
 */
beagle.getPersistMask = function()
{
    if(this.PERSIST_MASK && this.PERSIST_MASK != undefined)
        return this.PERSIST_MASK;
    var comp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"];
    this.PERSIST_MASK = (comp.PERSIST_FLAGS_FROM_CACHE | 
		    comp.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
		    comp.PERSIST_FLAGS_NO_BASE_TAG_MODIFICATIONS |
		    comp.PERSIST_FLAGS_DONT_FIXUP_LINKS |
		    comp.PERSIST_FLAGS_DONT_CHANGE_FILENAMES |
		    comp.PERSIST_FLAGS_CLEANUP_ON_FAILURE);
    return this.PERSIST_MASK;
}

beagle.getEncodeMask = function()
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
beagle.writeContent = function(page, tmpfilepath)
{
    var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    tmpfile.initWithPath(tmpfilepath);

    var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
    persist.persistFlags = this.getPersistMask();

    persist.saveDocument(page, tmpfile, null, null, this.getEncodeMask(), 0);
}

/**
 write raw-meatadata 
*/
beagle.writeRawMetadata = function(meta, tmpfilepath)
{
    var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    tmpfile.initWithPath(tmpfilepath);

    var stream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
    stream.QueryInterface(Components.interfaces.nsIOutputStream);
    stream.init(tmpfile, 0x04 | 0x08 | 0x20, 0600, 0);

    var line;
    dump("metas dumping \n");
    for(var i = 0; i < meta.length; i++)
    {
        line = meta[i] + "\n";
        dump(line);
        stream.write(line, line.length);
    }
    stream.flush();
    stream.close();
}


/**
 write meatadata  (include URI hittype mimetype characterset etc)
*/
beagle.writeMetadata = function(page, tmpfilepath)
{
    var meta = [
        page.location.href,
        'WebHistory',
        page.contentType,
        "k:_uniddexed:encoding="+page.characterSet];
    beagle.writeRawMetadata(meta,tmpfilepath);
}

/*
 just set the status label 
*/
beagle.setStatusLabel = function (msg)
{
    setTimeout(function(){document.getElementById('statusbar-display').label = msg;},100);
}

beagle.indexPage = function(page)
{

    if(!this.checkPage(page))
        return;

    dump("[beagle] We will index " + page.location.href + '\n'); 
    
    //save file content and metadats
    var hash = hex_md5(page.location.href);
    var tmpdatapath = this.dataPath + "/firefox-beagle-" + hash;
    var tmpmetapath = this.dataPath + "/.firefox-beagle-" + hash;
        
    try {
        this.writeContent(page, tmpdatapath);
        this.writeMetadata(page, tmpmetapath);
    } catch (ex) {
        dump ("beaglePageLoad: beagleWriteContent/Metadata failed: " + ex + "\n");
        //if(confirm("Fail to write content/metadata ! \n Would you like to disable beagle now ?"))
        //    this.disable();
        return;
    }
    this.setStatusLabel(_f("beagle_statuslabel_indexing",[page.location]));

}

beagle.indexFile = function(url,contentType)
{

    dump("[beagle] We will index " + url + '\n'); 
    
    //save file content and metadats
    var hash = hex_md5(url);
    var tmpmetapath = this.dataPath + "/.firefox-beagle-" + hash;
    var meta = [url,'WebHistory',contentType];
    if(this.tasks[url] && this.tasks[url]['meta'])
    {
        meta = meta.concat(this.tasks[url]['meta'])
    }
    try {
        this.writeRawMetadata(meta, tmpmetapath);
    } catch (ex) {
        dump ("beagleIndexFile: beage write Metadata failed: " + ex + "\n");
        //    this.disable();
        return;
    }
    this.setStatusLabel(_f("beagle_statuslabel_indexing",[url]));
}


beagle.indexLink = function()
{
    var url = gContextMenu.linkURL; 
    if (!url)
        return;
    var hash = hex_md5(url);
    var tmpdatapath = this.dataPath + "/firefox-beagle-" + hash;
    //this.tasks[url] = {meta:[]}; 
    window.openDialog("chrome://newbeagle/content/indexLink.xul",
        "","chrome,centerscreen,all,resizable,dialog=no",window,url,tmpdatapath);
}

beagle.indexImage = function()
{
    var image = gContextMenu.target; 
    if(image.tagName.toLowerCase() != 'img' || !image.src)
        return;
    var url = image.src;
    var hash = hex_md5(url);
    var tmpdatapath = this.dataPath + "/firefox-beagle-" + hash;
    this.tasks[url] = {
        meta:["t:alttext="+(image.getAttribute('alt')?image.getAttribute('alt'):"")],
    };
    window.openDialog("chrome://newbeagle/content/indexLink.xul",
        "","chrome,centerscreen,all,resizable,dialog=no",window,url,tmpdatapath);
}

beagle.onLinkLoad = function(url,contentType,doc)
{
    if(contentType.match(/(text|html|xml)/i) && doc)// a document
    {
        beagle.indexPage(doc);
    }
    else
    {
        beagle.indexFile(url,contentType);
    }
}

beagle.onPageLoad = function(event)
{ 
    dump("[beagle] Page Loaded \n");
    //if disabled or error
    if(this.runStatus != this.RUN_ENABLED)
    {
        dump("[beagle ] NOT RUN_ENABLED status .  NO INDEX\n");
        return;
    }

    var page = event.originalTarget;
    if (!this.shouldIndex(page))
        return;
    this.indexPage(page);
}   

beagle.disable = function()
{
    this.runStatus = this.RUN_DISABLED;
    
    var icon = document.getElementById('beagle-notifier-status');
    icon.setAttribute("status","00f");
    //icon.setAttribute("src","chrome://newbeagle/skin/beagle-disabled.png");
    icon.setAttribute("tooltiptext",_("beagle_tooltip_disabled"));

    this.pref.load();
    this.pref.prefObject["beagle.enabled"] = false;
    this.pref.save();

}

beagle.enable = function()
{
    this.runStatus = this.RUN_ENABLED;
    
    var icon = document.getElementById('beagle-notifier-status');
    icon.setAttribute("status","000");
    //icon.setAttribute("src","chrome://newbeagle/skin/beagle.png");
    icon.setAttribute("tooltiptext",_("beagle_tooltip_actived"));

    this.pref.load();
    this.pref.prefObject["beagle.enabled"] = true;
    this.pref.save();

}

beagle.error = function(msg)
{
    var icon = document.getElementById('beagle-notifier-status');
    icon.setAttribute("status","f00");
    //icon.setAttribute("src","chrome://newbeagle/skin/beagle-error.png");
    icon.setAttribute("tooltiptext",_f("beagle_tooltip_error",[msg]));

    this.pref.load();
    this.pref.prefObject["beagle.enabled"] = false;
    this.pref.save();

    this.runStatus = this.RUN_ERROR;
}

beagle.quickAddRule = function (page,flag)
{
    try{
        var domain =  page.location.hostname;
        beaglePref.addRule("qa_" + domain,domain,"domain",flag);
    }
    catch(e){
        //alert("Error! Is this a site ?\n");
        //pass
    }
}

beagle.showPrefs = function()
{
  window.openDialog('chrome://newbeagle/content/beaglePrefs.xul',
		    'PrefWindow',
		    'chrome,modal=yes,resizable=no',
		    'browser');
}

beagle.onIconClick = function(event)
{
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
            alert("Error running Beagle Indexer: " + this.RunStatus);
            break;
        }
    }
}


function beagleInit()
{
    beagle.init();
}

function beaglePageLoad(event)
{
    beagle.onPageLoad(event);
}
function beagleProcessClick(event)
{
    beagle.onIconClick(event);
}

// Create event listener.
window.addEventListener('load', beagleInit, false); 

