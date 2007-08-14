#!/usr/bin/env python
#vim:fileencoding=utf8

#   Index Web pages when you visist them using beagle
#   Copyright (C) 2007 Tao Fei     
#
#   This program is free software; you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation; either version 2 of the License, or
#   (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License along
#   with this program; if not, write to the Free Software Foundation, Inc.,
#   51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.


import gtk
import epiphany
import md5
import os
import ConfigParser
import re
import string
import mimetypes
import gettext

#these are constant
beagle_data_path = os.environ["HOME"] + "/.beagle/ToIndex/"
config_file_path = os.environ["HOME"] + "/.gnome2/epiphany/extensions/beagleIndexer.conf"

#The following is about config
class Config(dict):
    def __getattr__(self, name):
        return self[name]
    def __setattr__(self, name,value):
        self[name] = value

def load(fullpath, default={}):
    '''Load a config file as a Config Object'''
    module = type(os)
    try:
        code = open(fullpath).read()
    except IOError:
        return Config(default)
        #raise ImportError, 'No module named  %s' %fullpath

    filename = os.path.basename(fullpath)

    m = module(filename)
    exec compile(code, filename, 'exec') in m.__dict__
    for item in default.items():
        m.__dict__.setdefault(item[0],item[1])
    return Config(m.__dict__)

def save(fullpath,config):
    '''Save a Config Object to a config file'''
    print "save config to file "
    try:
        outfile = open(fullpath,'w')
    except IOError:
        print "beagle save config file to to %s error " %fullpath
        return
    for key in config.keys():
        if key[0] == '_':
            continue
        outfile.write(key + '=')
        value = config[key]
        if type(value) == type(True):
            outfile.write(str(value) + '\n')
        elif type(value) == type([]):
            outfile.write('[\n')
            for li in value:
                outfile.write('"' + li + '",\n')
            outfile.write(']\n')
        else:
            outfile.write('"Not supported type"\n')
    outfile.close()



#default config value
_ConfigDefault = {
    'auto_index':True,
    'index_https':False,
    'default_index':True,
    'white_list_first':True,
    'white_list':[],
    'black_list':[],
}

#load config
config = load(config_file_path,_ConfigDefault)

#i18n init
try:
    gettext.install('py_beagle_for_epiphany',config.locale_dir_path)
except:
    gettext.install('py_beagle_for_epiphany')

#The following code is about menu item 
_ui_str = """
<ui>
 <menubar name="menubar">
  <menu name="ToolsMenu" action="Tools">
   <separator/>
   <menu name="BeagleMenu" action="BeagleMenuAction">
       <menuitem name="PyBeagleExtIndexThisPage"
             action="PyBeagleExtIndexThisPageAction"/>
       <menuitem name="PyBeagleExtAuto"
             action="PyBeagleExtAutoAction"/>
   </menu>
   <separator/>
  </menu>
 </menubar>
 <popup name="EphyDocumentPopup" action="PopupAction">
    <menuitem name="PyBeagleExtIndexThisPagePopup"
      action="PyBeagleExtIndexThisPageAction"/>
 </popup>
 <popup name="EphyLinkPopup" action="PopupAction">
  <separator />
  <menuitem name="IndexLink" 
    action="PyBeagleExtIndexLinkAction"/>
 </popup>
</ui>
"""

# we use window.get_active_tab(): we want the menu entries to reflect the active
# tab, not necessarily the one which fired a signal.
def _update_action(window):
	index_this_page_action = window.get_ui_manager().get_action('/menubar/ToolsMenu/BeagleMenu/PyBeagleExtIndexThisPage')

	tab = window.get_active_tab()

	# Tab is None when a window is first opened
	sensitive = (tab != None and tab.get_load_status() != True)
	index_this_page_action.set_sensitive(sensitive)

#update the action (index this page ) when swith page 
def _switch_page_cb(notebook, page, page_num, window):
	_update_action(window)

def _index_this_page_cb(action, window):
    tab = window.get_active_tab()
    embed = tab.get_embed()
    index_embed(embed)
    set_status_label(window,_("beagle is indexing %s") % embed.get_location(True))

def _toggle_auto_cb(action,window):
    print "toggle auto index"
    action = window.get_ui_manager().get_action('/menubar/ToolsMenu/BeagleMenu/PyBeagleExtAuto')
    print action.get_active()
    if config.auto_index != action.get_active():
        config.auto_index = action.get_active()
        save(config_file_path, config)

def _index_link_cb(action,window):
    print "_index_link_cb"
    event = window.get_context_event()
    if event is None:
        return
    value = event.get_event_property("link")
    index_link(value)
    set_status_label(window,_("beagle is indexing link %s") %value)
    pass

def _load_status_cb(tab,event,window):
    '''
    Callback for load_status chanage
    the load_status == false means the page is loaded.
    So we will do our job 
    '''
    print "beagle in _load_status_cb"
    print "update action "
    _update_action(window)
    if not config.auto_index:
        print "Auto Index is turned off. No index "
        return
    #page is loaded  
    if tab != None and tab.get_load_status() != True:
        embed = tab.get_embed()
        url = embed.get_location(True)
        if should_index(url) == False:
            print "%s will NOT be indexed." % url
            return
        print "beagle will index %s" % url
        index_embed(embed)
        set_status_label(window,"beagle will index %s " % url)

# This is to pass to gtk.ActionGroup.add_actions()
_actions = [
        ('BeagleMenuAction',None,'Beagle',None,None,None),
        ('PyBeagleExtIndexThisPageAction', None,
	     _('Index This Page'), None, None, _index_this_page_cb),
	    ('PyBeagleExtIndexLinkAction',None,
         _('Index Link'), None, None, _index_link_cb),
	   ]
_toggle_actions = [
        ("PyBeagleExtAutoAction",None,
         _("Auto Index"),None,None,_toggle_auto_cb)
]

def set_status_label(window,msg):
    statusbar = window.get_statusbar()
    context_id = statusbar.get_context_id("beagle")
    statusbar.pop(context_id)
    statusbar.push(context_id,msg)


def should_index(url):
    url = url.lower()
    if not config.index_https and url.find("https") == 0:
        return False
    in_blacklist = False
    for item in config.black_list:
        if re.match(item,url):
            in_blacklist = True
    in_whitelist = False
    for item in config.white_list:
        if re.match(item,url):
            in_whitelist = True
    if in_blacklist and in_whitelist:
        return config.default_index
    if (not in_blacklist) and (not in_whitelist):
        return config.white_list_first
    return in_whitelist

def index_embed(embed):
    url = embed.get_location(True)
    print "beagle index embed " + url
    md5_hash = md5.new(url).hexdigest() 
    beagle_content_path = beagle_data_path + "epiphany-" + md5_hash 
    beagle_meta_path = beagle_data_path + ".epiphany-" + md5_hash
    write_content(embed,beagle_content_path)
    write_raw_meta(get_metas_from_embed(embed),beagle_meta_path)

def index_link(url):
    md5_hash = md5.new(url).hexdigest() 
    beagle_content_path = beagle_data_path + "epiphany-" + md5_hash 
    beagle_meta_path = beagle_data_path + ".epiphany-" + md5_hash
    write_file(url,beagle_content_path)
    write_raw_meta(get_metas_from_url(url),beagle_meta_path)

def write_file(url,path):
    print "write file %s to %s " %(url,path)
    persist = epiphany.ephy_embed_factory_new_object("EphyEmbedPersist")
    persist.set_flags(epiphany.EMBED_PERSIST_NO_VIEW)
    persist.set_source(url)
    persist.set_dest(path)
    def save_completed_cb(persist,url):
        print "save completed for %s" %url
    persist.connect("completed",save_completed_cb,url)
    persist.save()

def write_content(embed,path):
    persist = epiphany.ephy_embed_factory_new_object("EphyEmbedPersist")
    persist.set_flags(epiphany.EMBED_PERSIST_NO_VIEW 
                    |epiphany.EMBED_PERSIST_COPY_PAGE 
                    |epiphany.EMBED_PERSIST_MAINDOC
                    |epiphany.EMBED_PERSIST_FROM_CACHE)
    persist.set_embed(embed)
    persist.set_dest(path)
    persist.save()

def get_metas_from_url(url):
    return [
        url,
        "WebHistory",
        guess_content_type(url),
    ]

def get_metas_from_embed(embed):
    url = embed.get_location(True)
    return [
        url,
        "WebHistory",
        guess_content_type(url),
        "k:_uniddexed:encoding="+embed.get_encoding()
    ]

def write_raw_meta(metas,path):
    meta_file = open(path,'w')
    for meta in metas:
        meta_file.write(meta + '\n')
    meta_file.close()

#guess content type
#that's not reliabe. but I found no API to get the contenttype
def guess_content_type(url):
    type,encoding = mimetypes.guess_type(url)
    if type is None:
       return ""
    else:
       return type
 
#Implement epiphany extension interface

def attach_window(window):
    ui_manager = window.get_ui_manager()
    group = gtk.ActionGroup('PyBeagleExt')
    group.add_actions(_actions, window)
    group.add_toggle_actions(_toggle_actions, window)
    ui_manager.insert_action_group(group, -1)
    ui_id = ui_manager.add_ui_from_string(_ui_str)
    window._py_beagle_window_data = (group, ui_id)
    notebook = window.get_notebook()
    sig = notebook.connect('switch_page', _switch_page_cb, window)
    notebook._py_beagle_sig = sig
    
    auto_index_action = window.get_ui_manager().get_action('/menubar/ToolsMenu/BeagleMenu/PyBeagleExtAuto')
    auto_index_action.set_active(config.auto_index)

def detach_window(window):
    notebook = window.get_notebook()
    notebook.disconnect(notebook._py_beagle_sig)
    del notebook._py_beagle_sig

    group, ui_id = window._py_beagle_window_data
    del window._py_beagle_window_data

    ui_manager = window.get_ui_manager()
    ui_manager.remove_ui(ui_id)
    ui_manager.remove_action_group(group)
    ui_manager.ensure_update()


def attach_tab(window,tab):
    sig = tab.connect("notify::load-status",_load_status_cb,window)
    tab._python_load_status_sig = sig

def detach_tab(window,tab):
    if hasattr(tab,"_python_beagle_load_status_sig"):
        tab.disconnect(tab._python_beagle_load_status_sig)
        del tab._python_beagle_load_status_sig