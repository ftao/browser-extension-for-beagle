/**
a browser used to download the link/image and index it
*/

beagleInvisibleBrowser = {

	get ELEMENT() { return document.getElementById("beagle-invisible-browser"); },
    
    currentURL: null,
    opener : null,
	onload    : null,

	init : function(opener)
	{
        this.opener = opener;
		this.ELEMENT.webProgress.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		this.onload = function(){ beagleInvisibleBrowser.doIndex();};
		this.ELEMENT.addEventListener("load", beagleInvisibleBrowser.onload, true);
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

	doIndex : function()
	{
		document.getElementById('beagle-index-link-status').value = "Saving" + "... " + this.currentURL;
        //alert(this.opener.beagle);
        this.opener.beagle.indexIt(this.ELEMENT.contentDocument);
        window.close();
        //alert(this.ELEMENT.contentDocument);
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
		if ( aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_START )
		{
			document.getElementById('beagle-index-link-status').value = "LOADING" + "... " + this.currentURL;
		}
	},

	onProgressChange : function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
	{
        if ( aCurTotalProgress != aMaxTotalProgress )
        {
            document.getElementById('beagle-index-link-status').value = 
                "LOADING (" +aCurTotalProgress + "/" + aMaxTotalProgress +") ... " + this.currentURL;
        }
	},

	onStatusChange   : function() {},
	onLocationChange : function() {},
	onSecurityChange : function() {},

};

window.onload = function()
{
    //alert(window.arguments[0]);
    beagleInvisibleBrowser.init(window.arguments[1]);
    beagleInvisibleBrowser.load(window.arguments[0]);
}
