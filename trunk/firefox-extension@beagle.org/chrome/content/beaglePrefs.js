/*
 * Beagle Extension: Index webpages you visit using the Beagle Indexing Engine.
 * An Extension for the Firefox Browser.
 */

var beaglePref = {
    
    //I use this value to check weather a file is a valid beagle preference file 
    appUID : "browser-extesnion@beagle.org", 
    
    RULE_INCLUDE : 1,
    RULE_EXCLUDE : 2,

    // Declare Pref Keys and Type.
    prefKeys : [ 
      {'name':'beagle.security.active','type':'bool'},
      {'name':'beagle.default.action','type':'int'},
      {'name':'beagle.conflict.action','type':'int'},
      {'name':'beagle.include.list','type':'string'},
      {'name':'beagle.exclude.list','type':'string'},
      {'name':'beagle.enabled','type':'bool'}
    ],

    // Initiate a new preference instance.
    prefService : Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch),

    prefObject : {},

    /*
     * Load Prefs into a javascript object
     *
     */
    load : function()
    {
        //dump(this.prefKeys.toJSONString());
        
        for(var j = 0 ; j < this.prefKeys.length; j++)
        {
            switch(this.prefKeys[j]['type'])
            {
            case 'bool':
                this.prefObject[this.prefKeys[j]['name']] = this.prefService.getBoolPref(this.prefKeys[j]['name']);
                break;
            case 'string':
                this.prefObject[this.prefKeys[j]['name']] = this.prefService.getCharPref(this.prefKeys[j]['name']);
                break;
            case 'int':
                this.prefObject[this.prefKeys[j]['name']] = this.prefService.getIntPref(this.prefKeys[j]['name']);
                break;
            }
        }
        return this.prefObject;
    },

    /*
     * Save Prefs into firefox
     */
    save : function()
    {
        for(var j = 0; j< this.prefKeys.length; j++)
        {
            switch(this.prefKeys[j]['type'])
            {
            case 'bool':
                this.prefService.setBoolPref(this.prefKeys[j]['name'], this.prefObject[this.prefKeys[j]['name']]);
                break;
            case 'string':
                this.prefService.setCharPref(this.prefKeys[j]['name'], this.prefObject[this.prefKeys[j]['name']]);
                break;
            case 'int':
                this.prefService.setIntPref(this.prefKeys[j]['name'], this.prefObject[this.prefKeys[j]['name']]);
            }                
        }
        //dump("Save Beagle Prefs:" + this.prefObject.toJSONString() + "\n");
    },

    init : function ()
    {
       this.load(); 
       this.UIInit();
    },

    UIInit : function ()
    {
        var checkboxElements = ["beagle.security.active"]
        for(var i = 0; i < checkboxElements.length; i++)
        {
            var elementID = checkboxElements[i];
            try{
                $(elementID).checked = this.prefObject[elementID]
             }
            catch(e){
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
            catch(e){
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
                //dump("listbox.getRowCount:" + listbox.getRowCount() + '\n');
                var num = listbox.getRowCount();
                for (var j = 0; j < num; j++)
                    listbox.removeItemAt(0);
                
                for (var j = 0; j < items.length; j++){
                    listbox.appendRow(items[j]['name'],items[j]['pattern'],items[j]['patternType']);
                 }
            } catch(e) {
                // We don't seem to care about this.
            }
        }
     
    },

    /*
     *This function is called when the ok button is clicked
     *
     */
    onSave : function ()
    {
        var prefs = {};
        
        var checkboxElements = ["beagle.security.active","beagle.context.active"]
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
             
        //beagle.include.list
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
                //dump(value)
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
     * TODO: use more proper words
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
     *
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


    addRule : function (name,pattern,type,flag)
    {
        this.load();
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
        var rules = this.prefObject[key].parseJSON();
        rules.push({"name":name,"pattern":pattern,"patternType":type});
        this.prefObject[key] = rules.toJSONString();
        this.save();
    },
}

