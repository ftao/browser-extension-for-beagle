/**
index bookmarks.
Include URL,name,shorcurURL (the keywords), description
The folder name is not indexed.
After a total index, a last-indexed-date is saved.
Later only index the modified bookmark or new bookmarks.
*/


//Used to include only one time bookmark.js and avoid error message about already specified constant
try{
    if(ADD_BM_DIALOG_FEATURES) {}
} catch(e){
    var loader =  Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		    .getService(Components.interfaces.mozIJSSubScriptLoader);
    loader.loadSubScript("chrome://browser/content/bookmarks/bookmarks.js");
}
if(!BMDS)
{
    //init bookmark js service
    initServices();
    initBMService();
}


function Bookmark(bmRes)
{
    this.bmRes = bmRes;
    this.URL = this.getLiteral(this.URLArc);
    this.Name = this.getLiteral(this.NameArc);
    this.ShortcutURL = this.getLiteral(this.ShorcurURLArc);
    this.Description = this.getLiteral(this.DescriptionArc);
    this.LastModifiedDate = this.getDate(this.LastModifiedDateArc);
    this.LastVisitDate = this.getDate(this.LastVisitDateArc);
    this.BookmarkAddDate = this.getDate(this.BookmarkAddDateArc);
}

Bookmark.prototype = {
    URLArc:             RDF.GetResource(gNC_NS + "URL"),
    //FeedURLArc:         RDF.GetResource(gNCNS + "FeedURL",
    NameArc:            RDF.GetResource(gNC_NS + "Name"),
    ShortcutURLArc:     RDF.GetResource(gNC_NS + "ShortcutURL"),
    DescriptionArc:     RDF.GetResource(gNC_NS + "Description"),
    LastModifiedDateArc:RDF.GetResource(gWEB_NS + "LastModifiedDate"),
    LastVisitDateArc:   RDF.GetResource(gWEB_NS + "LastVisitDate"),
    BookmarkAddDateArc:   RDF.GetResource(gNC_NS + "BookmarkAddDate"),
    
    isModified: function(lastIndexDate)
    {   
        var last_modified = this.LastModifiedDate;
        if (!last_modified)
            last_modified = this.BookmarkAddDate;
        log("bookmark isModified " + last_modified  + " > " + lastIndexDate + "?");
        return last_modified && last_modified > lastIndexDate;
    },

    //TODO:is it ok?
    isBookmark: function()
    {
        return !!this.URL;
    },
    getLiteral:function(arc) 
    {
        try{
            var target = BMDS.GetTarget(this.bmRes, arc, true);          
            if (target) {
                   return target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
            }
        } catch (e) { /* probably a bad interface */ }
        return null;
    },
    getDate:function(arc) 
    {
        try{
            var target = BMDS.GetTarget(this.bmRes, arc, true);          
            if (target) {
                   return target.QueryInterface(Components.interfaces.nsIRDFDate).Value/1000;
            }
        } catch (e) { /* probably a bad interface */ }
        return null;
    },

}

var BookmarkIndexer = {
    
    //get the bookmark  one by one 
    //if filter(bookmark) == true do action(bookmark)
    walk: function(filter,action)
    {   
        //log("beagle begin walk ");
        //BMDS : bookmarks data source 
        //@see chrome://browser/content/bookmarks/bookmarks.js
        var AllBookmarksResources = BMDS.GetAllResources();
        
        while (AllBookmarksResources.hasMoreElements()) {
            var bmRes = AllBookmarksResources.getNext().QueryInterface(kRDFRSCIID);
            var bookmark = new Bookmark(bmRes);
            //log("beagle check bookmark " + bookmark );
            if(filter.call(null,bookmark))
                action.call(null,bookmark);
        }
    },
    /**
    Index a bookmark.
    write meta to metafile and write a empty content file
    */
    indexBookmark: function(bookmark)
    {
        log("index bookmark " + bookmark.URL + "\n");
        var meta = [
            bookmark.URL,
            "FirefoxBookmark",
            "text/plain", //TODO what the content type should be 
            "k:name=" + bookmark.Name,
        ];
        if(bookmark.Description)
            meta.push("t:description=" + bookmark.Description);
        if(bookmark.ShortcutURL)
            meta.push("t:shortcuturl=" + bookmark.ShortcutURL);
        if(bookmark.LastModifiedDate)
            meta.push("k:lastmodifieddate=" + bookmark.LastModifiedDate);
        if(bookmark.LastVisitDate)
            meta.push("k:lastvisitdate=" + bookmark.LastVisitDate);
        beagle.writeRawMetadata(meta,beagle.getMetaPath(bookmark.URL,"bookmark"));
        // a little hack , write empty content to content file
        beagle.writeRawMetadata([],beagle.getContentPath(bookmark.URL,"bookmark"));
    },
    /**
    Index all the bookmarks. 
    It is not used.
    */
    indexAll:function()
    {
        this.walk(
            function(bookmark){return bookmark.isBookmark();}, 
            this.indexBookmark
        );
        beaglePref.set("beagle.bookmark.last.indexed.date","" + (new Date()).getTime());
    },
    /**
    Index the modifled (or new ) bookmarks.
    */
    indexModified:function()
    {
        var lastIndexDate = beaglePref.get("beagle.bookmark.last.indexed.date");
        this.walk(
            function(bookmark){return bookmark.isBookmark() && bookmark.isModified(lastIndexDate);},
            this.indexBookmark
        );
        beaglePref.set("beagle.bookmark.last.indexed.date","" + (new Date()).getTime());
    }
}


