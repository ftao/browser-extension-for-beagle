//check the string budles

var bundles = document.getElementByTagName('stringbundle');

var mapping = {};

function gettext(key)
{
    //if this string have been looked up before
    if(mapping[stringId])
        return mapping[stringId];

    var ret = null;
    for(var i = 0 ; i < bundles.length; i++)
    {
        ret = bundles[i].getString(key);
        if (ret != null)
            break;  
    }
    //not found , just return the orgi  orginal string 
    if (ret == null) 
        ret = key;
    mapping[key] = ret;
    return ret;
}

function _(key)
{
    return gettext(key);
}

function getformatedtext()
{
    key = arguments.shift();
    var ret = null;
    for(var i = 0 ; i < bundles.length; i++)
    {
        ret = bundles[i].getString(key);
        if (ret != null)
        {
            return bundles[i].getFormattedString(key,arguments);
        }
    }
    //not found , just return the orgi  orginal string 
    if (ret == null) 
        ret = stringId;
    
}

function _f()
{
    getformatedtext.applay(null,arguments);   
}

