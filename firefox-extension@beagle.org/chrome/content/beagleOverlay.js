/*
 * Beagle Extension: Index webpages you visit using the Beagle Indexing Engine.
 * An Extension for the Firefox  Browser.
 */


var beagle = {
    //some constant 
    RUN_BEAGLE_NOT_FOUND:-1,
    RUN_INITED: 0,
    RUN_ENABLED : 1,
    RUN_DISABLED : 2,
    RUN_ERROR : 3,
    
    pref : beaglePref,

    ENV:Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment),

    FILE_UTILS:new FileUtils(),// js lib  file utils
    /**
     *@see http://www.xulplanet.com/references/xpcomref/comps/c_embeddingbrowsernsWebBrowserPersist1.html
     */
    get PersistMask(){
        var comp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
        var PERSIST_MASK = (comp.PERSIST_FLAGS_FROM_CACHE | 
                comp.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
                comp.PERSIST_FLAGS_NO_BASE_TAG_MODIFICATIONS |
                comp.PERSIST_FLAGS_DONT_FIXUP_LINKS |
                comp.PERSIST_FLAGS_DONT_CHANGE_FILENAMES |
                comp.PERSIST_FLAGS_CLEANUP_ON_FAILURE);
        return PERSIST_MASK;
    },

    get EncodeMask(){
        var comp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
        return (comp.ENCODE_FLAGS_RAW | comp.ENCODE_FLAGS_ABSOLUTE_LINKS);
    },

    get STATUS_ICON(){ 
        return document.getElementById('beagle-notifier-status');
    },
    
    dataPath : null,
    
    /**
    the path to beagle search ,it is used for search (for link/page/text)
    */
    get beagleSearchPath() { 
        var path = this.ENV.get("PATH");
        if (path) {
            var split = path.split(':');
            var idx = 0;
            while (idx < split.length) 
            {
                var trypath = split[idx++] + '/' + "beagle-search";
                if (this.FILE_UTILS.exists(trypath))
                    return trypath;
            }
        }
        return undefined;
    },

    getContentPath: function(url)
    {
        var hash = hex_md5(url);
        return this.dataPath + "/firefox-beagle-" + hash;
        
    },

    getMetaPath: function(url)
    {
        var hash = hex_md5(url);
        return this.dataPath + "/.firefox-beagle-" + hash;
    },

    tasks: [],

    /*
     * init beagle, init status, init pathes .....
     * we will NOT get the prefs as it might be changed after init
     * we will get the prefs when we need it.
     */
    init : function()
    {
        dump("beagle init ");
        if(!this.checkEnv())
        {
            this.runStatus = this.RUN_BEAGLE_NOT_FOUND;
            this.error(_("beagle_not_found"));
        }
        else
        {
            if(this.pref.get('beagle.enable'))
            {
                this.enable();
            }
            else
            {
                this.disable();
            }
            this.dataPath = this.ENV.get("HOME") + "/.beagle/ToIndex";  
            if(!this.FILE_UTILS.exists(this.dataPath))
                ;// do something here ? is it safe to create the dir ?
        }
        this.addEventListener();
    },

    addEventListener : function ()
    {
        // Add listener for page loads
        if (this.runStatus != this.RUN_BEAGLE_NOT_FOUND && document.getElementById("appcontent"))
        {
            document.getElementById("appcontent").addEventListener(
                "load",
                Function.bind(this.onPageLoad,this),
                true
            );
            document.getElementById("contentAreaContextMenu").addEventListener(
                "popupshowing", 
                Function.bind(this.initContextMenu,this), 
                false
            );
        }
        this.STATUS_ICON.addEventListener(
            'click',
            Function.bind(this.onIconClick,this),
            false
        );
        //document.getElementById('beagle-notifier-status').onmouseup = function(event){ bealge.onIconClick(event);};
    },

    initContextMenu : function (e)
    {
        if(e.originalTarget.id != "contentAreaContextMenu")
            return;
        //dump("[beagle] gContextMenu " + gContextMenu + "\n");
        gContextMenu.showItem("beagle-context-index-this-link", gContextMenu.onLink && !gContextMenu.onMailtoLink); 
        gContextMenu.showItem("beagle-context-index-this-image", gContextMenu.onImage && gContextMenu.onLoadedImage); 
        gContextMenu.showItem("beagle-context-search-link", gContextMenu.onLink); 
        gContextMenu.showItem("beagle-context-search-text", gContextMenu.isTextSelected);
        document.getElementById("beagle-context-search-text").setAttribute("label",_f("beagle_context_search_text",[getBrowserSelection(16)]));
    },

    checkEnv : function()
    {
        if (!this.FILE_UTILS.exists (this.ENV.get("HOME") + "/.beagle")) {
            alert("Not Found ~/.beagle folder. This extension will not work");
            return false;
        }
        return true;
    },

    /*
    Check the page, 
    1. the protocal (We will NOT index about:* file:///* )
    2. check is the page  itself 
    */
    checkPage : function(page)
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
    },

    /*
     * check weather the url should index
     * return true if it need to index
     */
    shouldIndex : function(page)
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

    },



    /**
     write page content (NOT the HTML source, the DOM instead, it may include dym contnent created by js)
    */
    writeContent : function(page, tmpfilepath)
    {
        var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
        tmpfile.initWithPath(tmpfilepath);

        var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
        persist.persistFlags = this.PersistMask;
        persist.saveDocument(page, tmpfile, null, null, this.EncodeMask, 0);
    },

    /**
     write raw-meatadata 
    */
    writeRawMetadata : function(meta, tmpfilepath)
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
    },


    /**
     write meatadata  (include URI hittype mimetype characterset etc)
    */
    writeMetadata : function(page, tmpfilepath)
    {
        var url = page.location.href;
        var meta = [
            url,
            'WebHistory',
            page.contentType,
            "k:_uniddexed:encoding="+page.characterSet,
            ];
        if(typeof page.referrer != "undefined" && page.referrer != "")
        {
            meta.push("k:referrer=" + page. referrer);
        }
        if(this.tasks[url] && this.tasks[url]['meta'])
        {
            meta = meta.concat(this.tasks[url]['meta'])
        }
        beagle.writeRawMetadata(meta,tmpfilepath);
    },

    /*
     just set the status label 
    */
    setStatusLabel : function (msg)
    {
        setTimeout(function(){document.getElementById('statusbar-display').label = msg;},100);
    },

    indexPage : function(page)
    {

        if(!this.checkPage(page))
            return;

        dump("[beagle] We will index " + page.location.href + '\n'); 
        
        //save file content and metadats
        var tmpdatapath = this.getContentPath(page.location.href);
        var tmpmetapath = this.getMetaPath(page.location.href);
            
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

    },

    indexFile : function(url,contentType)
    {

        dump("[beagle] We will index " + url + '\n'); 
        
        var tmpmetapath = this.getMetaPath(url);
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
    },


    indexLink : function()
    {
        var url = gContextMenu.linkURL; 
        if (!url)
            return;
        dump("[beagle] add meta referrer " + gBrowser.currentURI.spec + "\n");
        this.tasks[url] = {
            meta:["k:referrer=" + gBrowser.currentURI.spec],
        };
        window.openDialog("chrome://newbeagle/content/indexLink.xul",
            "","chrome,centerscreen,all,resizable,dialog=no",url);
    },

    indexImage : function()
    {
        var image = gContextMenu.target; 
        if(image.tagName.toLowerCase() != 'img' || !image.src)
            return;
        var url = image.src;
        this.tasks[url] = {
            meta:[
                "t:alttext="+(image.getAttribute('alt')?image.getAttribute('alt'):""),
                "k:referrer="+gBrowser.currentURI.spec
            ],
        };
        window.openDialog("chrome://newbeagle/content/indexLink.xul",
            "","chrome,centerscreen,all,resizable,dialog=no",url);
    },

    onLinkLoad : function(url,contentType,doc)
    {
        if(contentType.match(/(text|html|xml)/i) && doc)// a document
        {
            this.indexPage(doc);
        }
        else
        {
            this.indexFile(url,contentType);
        }
    },

    onPageLoad : function(event)
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
    },   

    disable : function()
    {
        this.runStatus = this.RUN_DISABLED;
        this.STATUS_ICON.setAttribute("status","00f");
        this.STATUS_ICON.setAttribute("tooltiptext",_("beagle_tooltip_disabled"));
        this.pref.set("beagle.enabled",false);

    },

    enable : function()
    {
        this.runStatus = this.RUN_ENABLED;
        this.STATUS_ICON.setAttribute("status","000");
        this.STATUS_ICON.setAttribute("tooltiptext",_("beagle_tooltip_actived"));
        this.pref.set("beagle.enabled",true);
    },

    error : function(msg)
    {
        this.runStatus = this.RUN_ERROR;
        this.STATUS_ICON.setAttribute("status","f00");
        this.STATUS_ICON.setAttribute("tooltiptext",_f("beagle_tooltip_error",[msg]));
        this.pref.set("beagle.enabled",false);
    },

    quickAddRule : function (page,flag)
    {
        try{
            var domain =  page.location.hostname;
            this.pref.addRule("qa_" + domain,domain,"domain",flag);
        }
        catch(e){
            //alert("Error! Is this a site ?\n");
            //pass
        }
    },

    showPrefs : function()
    {
        window.openDialog('chrome://newbeagle/content/beaglePrefs.xul',
                'PrefWindow',
                'chrome,modal=yes,resizable=no',
                'browser');
    },

    onIconClick : function(event)
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
    },
    /**
    call beagle search by query 
    */
    search : function(query)
    {
        if(!this.beagleSearchPath)
            return;
        try {
            dump("Running beagle search with query: "+ query + "\n");
            var retval = this.FILE_UTILS.spawn(this.beagleSearchPath, ["", query]);
            if (retval) 
                alert("Error running beagle search: " + retval);
        } 
        catch(e){
                alert("Caught error from best: " + e);
        }
    },
};





// Create event listener.
window.addEventListener('load', Function.bind(beagle.init,beagle),false); 

