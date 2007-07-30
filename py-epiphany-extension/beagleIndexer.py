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

beagle_data_path = os.environ["HOME"] + "/.beagle/ToIndex/"
config_file_path = os.environ["HOME"] + "/.gnome2/epiphany/extensions/data/beagle/config.ini"
blacklist_file_path = os.environ["HOME"] + "/.gnome2/epiphany/extensions/data/beagle/blacklist.txt"
whiltelist_file_path = os.environ["HOME"] + "/.gnome2/epiphany/extensions/data/beagle/whitelist.txt"

_ConfigDefault = {
    'Basic/index_https':'0',
    'Basic/default_action':'INDEX',
    'Basic/conflic_action':'NOINDEX'
}

def LoadConfig(file, config={}):
    """
    returns a dictionary with key's of the form
    <section>.<option> and the values 
    """
    config = config.copy()
    cp = ConfigParser.ConfigParser()
    cp.read(file)
    for sec in cp.sections():
        name = string.lower(sec)
        for opt in cp.options(sec):
            config[name + "/" + string.lower(opt)] = string.strip(cp.get(sec, opt))
    return config

config = LoadConfig(config_file_path,_ConfigDefault)
try:
    blacklist = [item[0:-1] for item in file(blacklist_file_path,'r').readlines()]
except Exception,e:
    print e
    blacklist = []

print blacklist

def load_status_cb(tab,event):
    #dir_all(tab)
    print "python-beagle"
    if tab != None and tab.get_load_status() == False:
        embed = tab.get_embed()
        url = embed.get_location(True)
        if should_index(url) == False:
            print url + " will NOT be indexed.\n"
            return
        print "beagle will index " +  url
        md5_hash = md5.new(url).hexdigest() 
        beagle_content_path = beagle_data_path + "epiphany-" + md5_hash + ".htm"
        beagle_meta_path = beagle_data_path + ".epiphany-" + md5_hash + ".htm"
        #write the content
        persist = epiphany.ephy_embed_factory_new_object("EphyEmbedPersist")
        persist.set_embed(embed)
        persist.set_dest(beagle_content_path)
        persist.set_flags(epiphany.EMBED_PERSIST_NO_VIEW 
                        |epiphany.EMBED_PERSIST_COPY_PAGE 
                        |epiphany.EMBED_PERSIST_MAINDOC
                        |epiphany.EMBED_PERSIST_FROM_CACHE)

        persist.save()

        #write the meta
        meta_file = open(beagle_meta_path,'w')
        meta_file.write(url + '\n')
        meta_file.write("WebHistory\n")
        meta_file.write("text/html\n")
        meta_file.write("k:_uniddexed:encoding="+embed.get_encoding() + "\n")
        meta_file.close()
        #print tab.get_document_type()
        #statusbar = window.get
        #context_id = statusbar.get_context_id("beagle")
        #statusbar.pop(context_id)
        #statusbar.push(context_id,"beagle will index " + url)

def should_index(url):
    url = url.lower()
    if config['Basic.index_https'] == '0' and url.find("https") == 0:
        return False
    in_blacklist = False
    for item in blacklist:
        if re.match(item,url):
            in_blacklist = True
    in_whitelist = False
    for item in whitelist:
        if re.match(item,url):
            in_whitelist = True
    if in_blacklist and in_whitelist:
        return config['Basic/default_action'] == 'INDEX'
    if (not in_blacklist) and (not in_whitelist):
        return config['Basic/conflict_action'] == 'INDEX'
    return in_whitelist
    

def attach_tab(window,tab):
    sig = tab.connect("notify::load-status",load_status_cb)
    tab._python_load_status_sig = sig

def detach_tab(window,tab):
    if hasattr(tab,"_python_beagle_load_status_sig"):
        tab.disconnect(tab._python_beagle_load_status_sig)
        del tab._python_beagle_load_status_sig
