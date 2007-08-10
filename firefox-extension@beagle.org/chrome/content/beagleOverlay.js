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
        return (comp.PERSIST_FLAGS_FROM_CACHE | 
                comp.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
                comp.PERSIST_FLAGS_NO_BASE_TAG_MODIFICATIONS |
                comp.PERSIST_FLAGS_DONT_FIXUP_LINKS |
                comp.PERSIST_FLAGS_DONT_CHANGE_FILENAMES |
                comp.PERSIST_FLAGS_CLEANUP_ON_FAILURE);
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

    getContentPath: function(url,type)
    {
        if(typeof type == "undefined")
            type = "web";
        var hash = hex_md5(url);
        return this.dataPath + "/firefox-beagle-"+ type + "-" + hash;
        
    },

    getMetaPath: function(url,type)
    {
        if(typeof type == "undefined")
            type = "web";
        var hash = hex_md5(url);
        return this.dataPath + "/.firefox-beagle-"+ type + "-" + hash;
    },

    tasks: [],
    startTask : function(url,extrameta)
    {
        this.tasks[url] = {meta:extrameta};
    },
 
    /*
     * init beagle, init status, init pathes .....
     * we will NOT get the prefs as it might be changed after init
     * we will get the prefs when we need it.
     */
    init : function()
    {
        log("init");
        if(!this.checkEnv())
        {
            this.runStatus = this.RUN_BEAGLE_NOT_FOUND;
            this.error(_("beagle_not_found"));
        }
        else
        {
            if(this.pref.get('beagle.autoindex.active'))
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
        if (this.pref.get("beagle.first.run"))
        {
            this.pref.firstRunImport();
            this.pref.set("beagle.first.run",false);
        }
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
        if(this.runStatus != this.RUN_BEAGLE_NOT_FOUND)
        {
            window.addEventListener(
                "unload",
                function(){
                    if(beaglePref.get("beagle.bookmark.active"))
                        bookmarkIndexer.indexModified(false);
                },
                false
            );
/*            var observerService =
                 Components.classes["@mozilla.org/observer-service;1"]
                    .getService(Components.interfaces.nsIObserverService)
            var observer = {
                observe: function(subject,topic,data){
                    log("index bookmarks when exit");
                    dump(bookmarkIndexer.indexModified());
                    log(" done r");
                }
            };
            observerService.addObserver(observer,"quit-application",false);
*/
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
        //log(" gContextMenu " + gContextMenu );
        gContextMenu.showItem("beagle-context-index-this-link", gContextMenu.onLink && !gContextMenu.onMailtoLink); 
        gContextMenu.showItem("beagle-context-index-this-image", gContextMenu.onImage && gContextMenu.onLoadedImage); 
        gContextMenu.showItem("beagle-context-search-link", gContextMenu.onLink); 
        gContextMenu.showItem("beagle-context-search-text", gContextMenu.isTextSelected);
        document.getElementById("beagle-context-search-text").setAttribute("label",
            _f("beagle_context_search_text",[getBrowserSelection(16)]));
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
            log("[checkPage the page doesn't seems to be a page");
            return false;
        } 
        if (!page.location ||
            !page.location.href ||
            page.location.href.indexOf("about:") == 0 ||
            page.location.href.indexOf("file:") == 0 )
        {
            log("checkPage  strage page " + page );
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
                    //log("[check domain] is " + hostname + " end with " + pattern +" ? " + flag );
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
        log("[Should Index ? ] [exclude = "+flags[0] + "] [include = " + flags[1] + "]");
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
    for non-html file . save it (to ~/.beagle/ToIndex)
    */
    saveFile : function(url,path,progressListener)
    {
        var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
        tmpfile.initWithPath(path);
        var cacheKey  = Components.classes['@mozilla.org/supports-string;1'].createInstance(Components.interfaces.nsISupportsString);
        cacheKey.data = url;
        var urifix  = Components.classes['@mozilla.org/docshell/urifixup;1'].getService(Components.interfaces.nsIURIFixup);
        var uri     = urifix.createFixupURI(url, 0);
        var hosturi = null;
        if (uri.host.length > 0)
        {
            hosturi = urifix.createFixupURI(uri.host, 0);
        }
        this.persist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist);
        this.persist.persistFlags = this.PersistMask;
        if(progressListener)
            this.persist.progressListener = progressListener; 
        this.persist.saveURI(uri, cacheKey, hosturi, null, null, tmpfile);
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
        log("writing metas ");
        for(var i = 0; i < meta.length; i++)
        {
            line = meta[i] + "\n";
            log(meta[i]);
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
            "k:_unindexed:encoding="+page.characterSet,
            ];
        if(typeof page.referrer != "undefined" && page.referrer != "")
        {
            meta.push("t:fixme:referrer=" + page.referrer);
        }
        meta = meta.concat(this.tasks[url]['meta'])
        beagle.writeRawMetadata(meta,tmpfilepath);
    },

    /*
     just set the status label 
    */
    setStatusLabel : function (msg)
    {
        setTimeout(function(){document.getElementById('statusbar-display').label = msg;},100);
    },
    
    promptExtraKeywords : function(url)
    {
        //prompt for keywords.
        if(this.pref.get("beagle.prompt.keywords.active"))
        {
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                        .getService(Components.interfaces.nsIPromptService);
            var input = { value: "" };
            var chk = { value:false };
            result = prompts.prompt(window, _("beagle_prompt_keywords_title"),_("beagle_prompt_keywords_text"), input, null, chk);
            if (result)
            {
                this.tasks[url]["meta"].push("t:dc:keyword="+ input.value);
            }
        }
    },
    indexPage : function(page)
    {

        log(" We will index " + page.location.href ); 
        
        //save file content and metadats
        var tmpdatapath = this.getContentPath(page.location.href);
        var tmpmetapath = this.getMetaPath(page.location.href);
            
        try {
            this.writeContent(page, tmpdatapath);
            this.writeMetadata(page, tmpmetapath);
        } catch (ex) {
            log ("beaglePageLoad: beagleWriteContent/Metadata failed: " + ex );
            if(confirm(_('beagle_write_error_confirm')))
                this.disable();
            return;
        }
        this.setStatusLabel(_f("beagle_statuslabel_indexing",[page.location]));

    },

    indexFile : function(url,contentType)
    {

        log(" We will index " + url ); 
        
        var tmpmetapath = this.getMetaPath(url);
        var meta = [url,'WebHistory',contentType];
        if(this.tasks[url] && this.tasks[url]['meta'])
        {
            meta = meta.concat(this.tasks[url]['meta'])
        }
        try {
            this.writeRawMetadata(meta, tmpmetapath);
        } catch (ex) {
            log ("[indexFile] beage write Metadata failed: " + ex + "\n");
            if(confirm(_('beagle_write_error_confirm')))
                this.disable();
            return;
            //    this.disable();
            return;
        }
        this.setStatusLabel(_f("beagle_statuslabel_indexing",[url]));
    },

    indexThisPage : function()
    {
        var doc = document.getElementById('content').selectedBrowser.contentDocument;
        if(!this.checkPage(doc))
            return;
        var url = doc.location.href;
        this.startTask(url,[]);
        this.promptExtraKeywords(url);
        if(doc.contentType.match(/(text|html|xml)/i))// a document
        {
            this.indexPage(doc);
        }
        else
        {
            this.saveFile(url,this.getContentPath(url),null);
            this.indexFile(url,doc.contentType);
        }
    },

    indexLink : function()
    {
        var url = gContextMenu.linkURL; 
        if (!url)
            return;
        //log("add meta referrer " + gBrowser.currentURI.spec );
        this.tasks[url] = {
            meta:["t:fixme:referrer=" + gBrowser.currentURI.spec],
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
        this.startTasks(url,[
                "t:alttext="+(image.getAttribute('alt')?image.getAttribute('alt'):""),
                "t:fixme:referrer="+gBrowser.currentURI.spec]
                );
        window.openDialog("chrome://newbeagle/content/indexLink.xul",
            "","chrome,centerscreen,all,resizable,dialog=no",url);
    },

    onLinkLoad : function(url,contentType,doc)
    {   
        this.promptExtraKeywords(url);
        if(contentType.match(/(text|html|xml)/i) && doc)// a document
        {
            if(!this.checkPage(doc))
                return;
            this.indexPage(doc);
        }
        else
        {
            this.indexFile(url,contentType);
        }
    },

    onPageLoad : function(event)
    { 
        log("Page Loaded ");
        //if disabled or error
        if(this.runStatus != this.RUN_ENABLED)
        {
            log(" NOT RUN_ENABLED status .  NO INDEX");
            return;
        }

        //var page = event.originalTarget;
        if (!this.checkPage(page))
            return;
        if (!this.shouldIndex(page))
            return;
        this.startTask(page.location.href,[]);
        this.indexPage(page);
    },   

    disable : function()
    {
        this.runStatus = this.RUN_DISABLED;
        this.STATUS_ICON.setAttribute("status","00f");
        this.STATUS_ICON.setAttribute("tooltiptext",_("beagle_tooltip_disabled"));
        this.pref.set("beagle.autoindex.active",false);

    },

    enable : function()
    {
        this.runStatus = this.RUN_ENABLED;
        this.STATUS_ICON.setAttribute("status","000");
        this.STATUS_ICON.setAttribute("tooltiptext",_("beagle_tooltip_actived"));
        this.pref.set("beagle.autoindex.active",true);
    },

    error : function(msg)
    {
        this.runStatus = this.RUN_ERROR;
        this.STATUS_ICON.setAttribute("status","f00");
        this.STATUS_ICON.setAttribute("tooltiptext",_f("beagle_tooltip_error",[msg]));
        this.pref.set("beagle.autoindex.active",false);
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
            log("Running beagle search with query: "+ query );
            var retval = this.FILE_UTILS.spawn(this.beagleSearchPath, ["", query]);
            if (retval) 
                alert("Error running beagle search: " + retval);
        } 
        catch(e){
                alert("Caught error from beagle-search: " + e);
        }
    },
};





// Create event listener.
window.addEventListener('load', Function.bind(beagle.init,beagle),false); 

