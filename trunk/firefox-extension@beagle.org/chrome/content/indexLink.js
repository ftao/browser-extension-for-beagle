/**
a browser used to download the link/image and index it
*/

beagleInvisibleBrowser = {

	get ELEMENT() { return document.getElementById("beagle-invisible-browser"); },
    
    get STATUS_ELEMENT() { return document.getElementById("beagle-index-link-status");},
    
    get START_BUTTON() { return document.getElementById("beagle-index-link-start");},
    
    get STOP_BUTTON() { return document.getElementById("beagle-index-link-stop");},
    
    currentURL: null,
    
    currentContentType:null,
    
    isDocument:null,
	
    onload : null,
    
    sniffer: null,
    

	init : function(url)
	{
        this.currentURL = url;
        this.sniffer = new headerSniffer(
            url,
            "",
            Function.bind(this.onGetContentType,this),
            Function.bind(this.onGetResponseError,this)
        );
        this.sniffer.httpHead();
        this.STATUS_ELEMENT.value = "Connecting... " + url;
    },
    
    save : function(url,path)
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
        this.persist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Components.interfaces.nsIWebBrowserPersist),
        this.persist.persistFlags = window.opener.beagle.PersistMask;
        this.persist.progressListener =  this;
        this.persist.saveURI(uri, cacheKey, hosturi, null, null, tmpfile);
    
    },

	load : function(url)
	{
        this.currentURL = url
		this.ELEMENT.docShell.allowJavascript = true;
		this.ELEMENT.docShell.allowImages     = false;
		this.ELEMENT.docShell.allowMetaRedirects = false;
		this.ELEMENT.docShell.QueryInterface(Components.interfaces.nsIDocShellHistory).useGlobalHistory = false;
		this.ELEMENT.loadURI(url, null, null);
	},

    reload : function()
    {
        this.START_BUTTON.disabled=true;
        this.STOP_BUTTON.disabled=false;
        this.init(this.currentURL);
    },
    
    stop : function()
    {
        if(this.isDcoument)
            this.ELEMENT.stop();
        else
        {
            this.persist.progressListener =  null;
            this.persist.cancelSave();
            try{
                var tmpfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
                tmpfile.initWithPath(window.opener.beagle.getContentPath(this.currentURL));
                tmpfile.remove(false);
            }
            catch(ex){ dump(ex + "\n");}
        }
        this.START_BUTTON.disabled=false;
        this.STOP_BUTTON.disabled=true;
		this.STATUS_ELEMENT.value = _("beagle_index_link_stop");
    },

	doIndex : function()
	{
		this.STATUS_ELEMENT.value = _f("beagle_index_link_saving",[this.currentURL]);
        window.opener.beagle.onLinkLoad(this.currentURL,this.currentContentType,this.ELEMENT.contentDocument);
        window.close();
	},

	QueryInterface : function(aIID)
	{
		if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
			aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
			aIID.equals(Components.interfaces.nsIXULBrowserWindow) ||
			aIID.equals(Components.interfaces.nsISupports))
			return this;
		throw Components.results.NS_NOINTERFACE;
	},

	onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus)
	{
        //alert(aStateFlags);
		if ( aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_START )
		{
			this.STATUS_ELEMENT.value = _f("beagle_index_link_start",[this.currentURL]);
		}
		if ( !this.isDocument && aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP )
        {
            this.STATUS_ELEMENT.value = _f("beagle_index_link_saving",[this.currentURL]);
            window.opener.beagle.onLinkLoad(this.currentURL,this.currentContentType,null);
            window.close();
        }
	},

	onProgressChange : function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
	{
        if ( aCurTotalProgress != aMaxTotalProgress )
        {
            var progress = (aMaxSelfProgress > 0) ? Math.round(aCurSelfProgress / aMaxSelfProgress * 100) + "%" : aCurSelfProgress + "Bytes";
            this.STATUS_ELEMENT.value = _f("beagle_index_link_progress",[progress,this.currentURL]); 
        } 
	},

	onStatusChange   : function() {},
	onLocationChange : function() {},
	onSecurityChange : function() {},
    onGetContentType : function(contentType,url)
    {
        if(!contentType)
            contentType ="text/html";
        this.currentContentType = contentType;
        this.currentURL = url;
        if(contentType.match(/(text|html|xml)/i))
        {   
            this.isDocument = true;
		    this.ELEMENT.webProgress.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		    this.onload = function(){ beagleInvisibleBrowser.doIndex();};
 	        this.ELEMENT.addEventListener("load", beagleInvisibleBrowser.onload, true);
            this.load(url);//?
        }
        else
        {
            this.save(url,window.opener.beagle.getContentPath(url));
            this.isDocument = false;
        }
    },
    onGetResponseError : function(msg)
    {
        this.STATUS_ELEMENT.value = msg;
    },

};


/**
get the mimetype of the given url
*/
function headerSniffer(URLSpec, RefURLSpec,onSuccess,onError)
{
	this.URLSpec    = URLSpec;
	this.refURLSpec = RefURLSpec;
    this.onSuccess = onSuccess;
    this.onError = onError;
}


headerSniffer.prototype = {

	_URL     : Components.classes['@mozilla.org/network/standard-url;1'].createInstance(Components.interfaces.nsIURL),
    _IO      : Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService),
	_channel : null,
	_headers : null,

	httpHead : function()
	{
		this._channel = null;
		this._headers = {};
		try {
			this._URL.spec = this.URLSpec;
			this._channel = this._IO.newChannelFromURI(this._URL).QueryInterface(Components.interfaces.nsIHttpChannel);
			this._channel.loadFlags = this._channel.LOAD_BYPASS_CACHE;
			this._channel.setRequestHeader("User-Agent", navigator.userAgent, false);
			if ( this.refURLSpec ) this._channel.setRequestHeader("Referer", this.refURLSpec, false);
		} catch(ex) {
			this.onError(_("beagle_index_link_invalid_url"));
		}
		try {
			this._channel.requestMethod = "HEAD";
			this._channel.asyncOpen(this, this);
		} catch(ex) {
			this.onError(ex);
		}
	},

	getHeader : function(header_name)
	{
	 	try { return this._channel.getResponseHeader(header_name); } catch(ex) { return ""; }
	},

	getStatus : function()
	{
		try { return this._channel.responseStatus; } catch(ex) { return ""; }
	},
	
    onDataAvailable : function() {},
	onStartRequest  : function() {},
	onStopRequest   : function(aRequest, aContext, aStatus) { this.onHttpSuccess(); },

	onHttpSuccess : function()
	{
		var contentType = this.getHeader("Content-Type");
		var httpStatus = this.getStatus();
		
        switch ( httpStatus )
		{
			case 404 : this.onError(_("beagle_index_link_http_403")); return;
			case 403 : this.onError(_("beagle_index_link_http_404")); return;
			case 500 : this.onError(_("beagle_index_link_http_500")); return;
		}

        //if redirect 
		var redirectURL = this.getHeader("Location");
		if ( redirectURL )
		{
			if ( redirectURL.indexOf("http") != 0 ) redirectURL = this._URL.resolve(redirectURL);
			//re-sniffer 
            this.URLSpec = redirectURL;
            this.httpHead();
			return;
		}
        //contenType may looks like text/html; charset=UTF-8
        //we only need text/html
        contentType = contentType.split(';',1)[0];
        dump("[beagle ] get contenttype = " + contentType + "\n");
        this.onSuccess(contentType,this.URLSpec);
        
	},

};


window.onload = function()
{
    beagleInvisibleBrowser.init(window.arguments[0]);
}
