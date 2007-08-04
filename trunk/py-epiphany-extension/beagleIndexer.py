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
import sys

#The following is about config

#TODO: is it needed ?
Module = type(sys)
modules = {}
def load(fullpath, default={}, module=Module):
      try:
          code = open(fullpath).read()
      except IOError:
          return
          #raise ImportError, 'No module named  %s' %fullpath

      filename = os.path.basename(fullpath)

      try:
          return modules[filename]
      except KeyError:
          pass

      m = module(filename)
      m.__module_class__ = module
      m.__file__ = fullpath
      exec compile(code, filename, 'exec') in m.__dict__
      for item in default.items():
          m.__dict__.setdefault(item[0],item[1])

      modules[filename] = m
      return m

#these are constant
beagle_data_path = os.environ["HOME"] + "/.beagle/ToIndex/"
config_file_path = os.environ["HOME"] + "/.gnome2/epiphany/extensions/beagleIndexer.conf"

_ConfigDefault = {
    'auto_index':True,
    'index_https':False,
    'default_index':True,
    'white_list_first':True,
    'white_list':[],
    'black_list':[],
}


config = load(config_file_path,_ConfigDefault)

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


def _switch_page_cb(notebook, page, page_num, window):
	_update_action(window)

def _index_this_page_cb(action, window):
    tab = window.get_active_tab()
    embed = tab.get_embed()
    index_embed(embed)

def _toggle_enable_cb(action,window):
    print "toggle auto index"
    action = window.get_ui_manager().get_action('/menubar/ToolsMenu/BeagleMenu/PyBeagleExtAuto')
    config.auto_index = action.get_active()

# This is to pass to gtk.ActionGroup.add_actions()
_actions = [
        ('BeagleMenuAction',None,'Beagle',None,None,None),
        ('PyBeagleExtIndexThisPageAction', None,
	     'Index This Page', None, None, _index_this_page_cb),
	   ]
_toggle_actions = [
        ("PyBeagleExtAutoAction",None,
         "Auto Index",None,None,_toggle_enable_cb)
]


def load_status_cb(tab,event,window):
    '''
    Callback for load_status chanage
    the load_status == false means the page is loaded.
    So we will do our job 
    '''
    print "beagle in load_status_cb"
    print "update action "
    _update_action(window)
    if not config.auto_index:
        print "Auto Index is turned off. No index "
        return
    if tab != None and tab.get_load_status() != True:
        embed = tab.get_embed()
        url = embed.get_location(True)
        if should_index(url) == False:
            print url + " will NOT be indexed.\n"
            return
        print "beagle will index " +  url
        index_embed(embed)
        #print tab.get_document_type()
        #statusbar = window.get
        #context_id = statusbar.get_context_id("beagle")
        #statusbar.pop(context_id)
        #statusbar.push(context_id,"beagle will index " + url)

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
    beagle_content_path = beagle_data_path + "epiphany-" + md5_hash + ".htm"
    beagle_meta_path = beagle_data_path + ".epiphany-" + md5_hash + ".htm"
    write_content(embed,beagle_content_path)
    write_meta(embed,beagle_meta_path)

def write_content(embed,path):
    persist = epiphany.ephy_embed_factory_new_object("EphyEmbedPersist")
    persist.set_embed(embed)
    persist.set_dest(path)
    persist.set_flags(epiphany.EMBED_PERSIST_NO_VIEW 
                    |epiphany.EMBED_PERSIST_COPY_PAGE 
                    |epiphany.EMBED_PERSIST_MAINDOC
                    |epiphany.EMBED_PERSIST_FROM_CACHE)

    persist.save()

def write_meta(embed,path):
    url = embed.get_location(True)
    meta_file = open(path,'w')
    meta_file.write(url + '\n')
    meta_file.write("WebHistory\n")
    meta_file.write("text/html\n")
    meta_file.write("k:_uniddexed:encoding="+embed.get_encoding() + "\n")
    meta_file.close()
 
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
    sig = tab.connect("notify::load-status",load_status_cb,window)
    tab._python_load_status_sig = sig

def detach_tab(window,tab):
    if hasattr(tab,"_python_beagle_load_status_sig"):
        tab.disconnect(tab._python_beagle_load_status_sig)
        del tab._python_beagle_load_status_sig
