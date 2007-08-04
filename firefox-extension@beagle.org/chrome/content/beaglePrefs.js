/*
 * Beagle Extension: Index webpages you visit using the Beagle Indexing Engine.
 * An Extension for the Firefox Browser.
 */

// I hate global var , but I have to use it here.
// Initiate a new preference instance.
var gPrefService = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch);

var beaglePref = {
    
    //I use this value to check weather a file is a valid beagle preference file 
    appUID : "browser-extesnion@beagle.org", 
    
    RULE_INCLUDE : 1,
    RULE_EXCLUDE : 2,

    // Declare Pref Keys and Type.
    prefKeys : { 
      'beagle.security.active':{'type':'bool','default':false},
      'beagle.default.action':{'type':'int','default':1},
      'beagle.conflict.action':{'type':'int','default':1},
      'beagle.include.list':{'type':'string','default':"[]"},
      'beagle.exclude.list':{'type':'string','default':"[]"},
      'beagle.enabled':{'type':'bool','default':true},
      'beagle.bookmark.active':{'type':'bool','default':false},
      'beagle.bookmark.last.indexed.date':{'type':'string','default':'0'},
    },

   
    //functions used to get/set pref
    func_factory:{
        'get':{
            'bool': Function.bind(gPrefService.getBoolPref,gPrefService),
            'int': Function.bind(gPrefService.getIntPref,gPrefService),
            'string' : Function.bind(gPrefService.getCharPref,gPrefService)
        },
        'set':{
            'bool': Function.bind(gPrefService.setBoolPref,gPrefService),
            'int' : Function.bind(gPrefService.setIntPref,gPrefService),
            'string' : Function.bind(gPrefService.setCharPref,gPrefService)
        }
    },

    prefObject : {},
    
    /**
    get the pref value by key
    we will use right type according to prefKeys
    */
    get : function(key)
    {
        if(!this.prefKeys.hasOwnProperty(key))
            return null;
        try{
            return this.func_factory['get'][this.prefKeys[key]['type']].call(null,key);
        }
        catch(ex){
            log("[beaglPref.get " + key + "] " + ex );
            return this.prefKeys[key]['default']; 
        }
    },

    set : function(key,value)
    {
        if(!this.prefKeys.hasOwnProperty(key))
            return false;
        try{
            this.func_factory['set'][this.prefKeys[key]['type']].call(null,key,value);
            return true;
        }
        catch(ex){
            return false; 
        }
        
    },

    /*
     * Load Prefs into a javascript object
     *
     */
    load : function()
    {
        //log(this.prefKeys.toJSONString());
        
        for(key in this.prefKeys)
        {
            var value = this.get(key);
            if(value != null)
                this.prefObject[key] = value;
            else
                log(key + "is null" );
        }
        return this.prefObject;
    },

    /*
     * Save Prefs into firefox
     */
    save : function()
    {
        for(key in this.prefKeys)
        {
            this.set(key, this.prefObject[key]);
        }
        //log("Save Beagle Prefs:" + this.prefObject.toJSONString() );
    },

    init : function ()
    {
        log("beaglePref init");
        this.load(); 
        this.UIInit();
    },

    UIInit : function ()
    {
        log("beaglePref uiinit");
        var checkboxElements = ["beagle.security.active","beagle.bookmark.active"]
        for(var i = 0; i < checkboxElements.length; i++)
        {
            var elementID = checkboxElements[i];
            try{
                $(elementID).checked = this.prefObject[elementID]
             }
            catch(ex){
                log(ex);
                $(elementID).checked = true;
             }
        }

        var radioElements = ["beagle.default.action","beagle.conflict.action"]
        for(var i = 0; i < radioElements.length; i++)
        {
            var elementID = radioElements[i];
            var radios = $(elementID).getElementsByTagName('radio');
            try{
                for (var j = 0; j < radios.length; j++)
                {
                    if(radios[j].value == this.prefObject[elementID])
                    {
                        $(elementID).selectedItem = radios[j]
                        break;
                    }
                }
            }
            catch(ex){
                log(ex);
            }
        }
     
        //beagle.include.list and beagle.exclude.list
        var listElementIDs = ["beagle.include.list","beagle.exclude.list"];
        for (var i = 0; i < listElementIDs.length; i++)
        {
            var elementID = listElementIDs[i];
            try{
                var items = this.prefObject[elementID].parseJSON(); 
                var listbox = $(elementID) ;
                //log("listbox.getRowCount:" + listbox.getRowCount() + '\n');
                var num = listbox.getRowCount();
                for (var j = 0; j < num; j++)
                    listbox.removeItemAt(0);
                
                for (var j = 0; j < items.length; j++){
                    listbox.appendRow(items[j]['name'],items[j]['pattern'],items[j]['patternType']);
                 }
            } catch(ex) {
                log(ex);
                log(this.prefObject[elementID]);
            }
        }
        //if there are old extension's pref   enable the import-from-old button 
        try{
            if ( gPrefService.getCharPref("beagle.security.filters"))
                document.getElementById('beagle.import.from.old').disabled = false;
        }
        catch(ex){
            log(ex);
        }
     
    },

    /*
     *This function is called when the ok button is clicked
     *
     */
    onSave : function ()
    {
        var prefs = {};
        
        var checkboxElements = ["beagle.security.active","beagle.bookmark.active"]
        for(var i = 0; i < checkboxElements.length; i++)
        {
            var elementID = checkboxElements[i];
            try{
                prefs[elementID] = $(elementID).checked;
             }
            catch(e){
                prefs[elementID] = false;
             }
        }

        var radioElements = ["beagle.default.action","beagle.conflict.action"]
        for(var i = 0; i < radioElements.length; i++)
        {
            var elementID = radioElements[i];
            try{
                prefs[elementID] = $(elementID).value;
             }
            catch(e){
             }
        }
             
        //beagle.include.list and beagle.exclude.list
        var listElementIDs = ["beagle.include.list","beagle.exclude.list"];
        for (var i = 0; i < listElementIDs.length; i++)
        {
            var elementID = listElementIDs[i];
            try {
                var items = new Array() ;
                var listbox = $(elementID) ;

                for (var j = 0; j < listbox.getRowCount(); j++){
                    var listitem =  listbox.getItemAtIndex(j);
                    var name = listitem.getElementsByTagName('listcell')[0].getAttribute('value');
                    var pattern = listitem.getElementsByTagName('listcell')[1].getAttribute('value');
                    var patternType = listitem.getElementsByTagName('listcell')[2].getAttribute('value');
                    items.push({'name':name,'pattern':pattern,'patternType':patternType});
                }
                var value = items.toJSONString();
                prefs[elementID] = value;
            } catch(e) {
                // We don't seem to care about this.
            }
        }

        this.prefObject = prefs;
        this.save();   
    },

    onAddFilter : function (type)
    {
        window.openDialog(
            'chrome://newbeagle/content/beagleAddFilter.xul',
            _f("beagle_pref_add_filter_dlgname",[type]), 
            'chrome, modal',
            type
        );
    },

    /*
    remove a filter
    @arg type include or exclude
    */
    onRemoveFilter : function(type) 
    {
        try{
            var listbox = document.getElementById('beagle.'+type+'.list');
            listbox.removeItemAt(listbox.selectedIndex);
        } catch(e){
            //ignore
        }
    },

    /*
     * export current prefs into an file
     * It export the value that saved in firefox, not the value showed on the UI
     * TODO: choose the right logic
     */
    onExport : function()
    {
        var nsIFilePicker = Components.interfaces.nsIFilePicker;
        var fp = Components.classes["@mozilla.org/filepicker;1"]
                .createInstance(nsIFilePicker);
        //fp.appendFilter("js","*.js");
        fp.init(window, _("beagle_pref_export_select_file"), nsIFilePicker.modeSave);
        var res = fp.show();
        if (res != nsIFilePicker.returnCancel){
            var exportFile = new File(fp.file.path);
            if(exportFile.exists())
            {
                exportFile.remove();
            }
            exportFile.create();
            exportFile.open('w');
            this.load();
            this.prefObject["uid"] = this.appUID;
            exportFile.write(this.prefObject.toJSONString());
            exportFile.close();
        }
    },

    /*
     * import prefs from an file
     * UI will be updated. But the values will not be saved until save button is clicked. 
     * TODO: choose the right logic 
     */
    onImport : function ()
    {
        var nsIFilePicker = Components.interfaces.nsIFilePicker;
        var fp = Components.classes["@mozilla.org/filepicker;1"]
                .createInstance(nsIFilePicker);
        //fp.appendFilter("js","*.js");
        fp.init(window, _("beagle_pref_import_select_file"), nsIFilePicker.modeOpen);
        var res = fp.show();
        if (res == nsIFilePicker.returnOK){
            var importFile = new File(fp.file.path);
            importFile.open('r');
            var jsonString = importFile.read();
            importFile.close();
            try{
                var beaglePrefs = jsonString.parseJSON();
                if(beaglePrefs["uid"]==undefined || beaglePrefs["uid"] != this.appUID)
                    throw new Error(_("beagle_pref_import_not_valid")); 
            }
            catch(e){
                window.alert(_("beagle_pref_import_alert_not_valid"));
                return false;
            }
            this.prefObject = beaglePrefs;
            this.UIInit();
        }
    },

    /**
    Add Exclude / Include rule
    @arg name the rule name
    @arg pattern the pattern
    @arg type the pattern type 
    @arg flag  RULE_INCLUDE or RULE_EXCLUDE
    */
    addRule : function (name,pattern,type,flag)
    {
        switch(flag)
        {
        case this.RULE_INCLUDE:
            key = "beagle.include.list";
            break;
        case this.RULE_EXCLUDE:
            key = "beagle.exclude.list";
            break;
        default:
            //error
            return;
        }
        var rules = this.get(key).parseJSON();
        rules.push({"name":name,"pattern":pattern,"patternType":type});
        this.set(key,rules.toJSONString());
    },

    /**
    Import prefs from old extension.
    */
    onImportFromOld : function ()
    {
        //beagle.security.active, we use the same name , no import 
        try{ 
            //beagle.security.filters
            var filters = gPrefService.getCharPref("beagle.security.filters").split(";");
            var excludeList = document.getElementById('beagle.exclude.list');
            for(var i = 0; i < filters.length; i++)
            {
            if(filters[i] != "")
                excludeList.appendRow("Import_" + i, filters[i], "domain");
            }
        }
        catch(ex){};
    }
}

