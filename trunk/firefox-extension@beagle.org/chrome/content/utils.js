/*
 * Add A Row to a list (self)
 * Param is string . Might be more than one .
 * Every param is a considered to be a cell .
 */
Object.prototype.appendRow = function(){
    listitem = document.createElement('listitem');
    for(var i = 0; i< arguments.length; i++)
    {
        listcell = document.createElement('listcell');
        listcell.setAttribute('label',arguments[i]);
        listcell.setAttribute('value',arguments[i]);
        listitem.appendChild(listcell);
    }
    this.appendChild(listitem);
}

/*
 * == documet.getElementById
 * @param  elementID The elementID or an element 
 */
function $(elementID)
{
	if( typeof elementID == typeof "")
   		return document.getElementById(elementID);
	else
		return elementID;
}

/*
 * check weather a string is end with another 
 * usage: somestirng.endWith(antoherString)
 * @param {string} subfix  
 */
String.prototype.isEndWith = function(subfix)
{
    var index = this.lastIndexOf(subfix);
    return index != -1 && index + subfix.length == this.length;
}

/**
 * convert  a wildcard expression to regular expression
 * usage: wildcard.wildcard2RE
 * @return the re string ( not RegExp Object)
 */
String.prototype.wildcard2RE = function()
{
    return this.replace(/([\\\+\[\]\{\}\^])/g,"\\$1").replace(/\?/g,".?").replace(/\*/g,".*");
}



