/*
 * jQuery Plugin: Tokenizing Autocomplete Text Entry
 * Version 1.4.2
 *
 * Copyright (c) 2009 James Smith (http://loopj.com)
 * Licensed jointly under the GPL and MIT licenses,
 * choose which one suits your project best!
 *
 */

(function ($) {
// Default settings
var DEFAULT_SETTINGS = {
    hintText: "Type in a search term",
    noResultsText: "No results",
    searchingText: "Searching...",
    deleteText: "&times;",
    searchDelay: 400,
    minChars: 1,
    tokenLimit: null,
    jsonContainer: null,
    method: "GET",
    contentType: "json",
    queryParam: "q",
    tokenDelimiter: ",",
	selectiveColor: false,
    preventDuplicates: false,
	singleTokenOnly: false,
	redirectOnClick: false,
    showDropdownOnFocus: false,
	type: null,
    allowInsert: false,
	bottomText: null,
    prePopulate: null,
    animateDropdown: true,
    onResult: null,
    onAdd: null,
    linkedText: false,
    placeholderText: null,
    onDelete: null
};

// Default classes to use when theming
var DEFAULT_CLASSES = {
    tokenList: "token-input-list",
    token: "token-input-token",
    tokenDelete: "token-input-delete-token",
    selectedToken: "token-input-selected-token",
    highlightedToken: "token-input-highlighted-token",
    dropdown: "token-input-dropdown",
    dropdownItem: "token-input-dropdown-item",
    dropdownItem2: "token-input-dropdown-item2",
    selectedDropdownItem: "token-input-selected-dropdown-item",
    inputToken: "token-input-input-token"
};

// Input box position "enum"
var POSITION = {
    BEFORE: 0,
    AFTER: 1,
    END: 2
};

// Keys "enum"
var KEY = {
    BACKSPACE: 8,
    TAB: 9,
    ENTER: 13,
    ESCAPE: 27,
    SPACE: 32,
    PAGE_UP: 33,
    PAGE_DOWN: 34,
    END: 35,
    HOME: 36,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    NUMPAD_ENTER: 108,
    COMMA: 188,
	HASH: 51
};
/*
// Additional public (exposed) methods
var methods = {
    init: function(url_or_data_or_function, options) {
        var settings = $.extend({}, DEFAULT_SETTINGS, options || {});

        return this.each(function () {
            $(this).data("tokenInputObject", new $.TokenList(this, url_or_data_or_function, settings));
        });
    },
    clear: function() {
        this.data("tokenInputObject").clear();
        return this;
    },
    add: function(item) {
        this.data("tokenInputObject").add(item);
        return this;
    },
    remove: function(item) {
        this.data("tokenInputObject").remove(item);
        return this;
    },
    get: function() {
    	return this.data("tokenInputObject").getTokens();
   	}
}
*/

// Expose the .tokenInput function to jQuery as a plugin

$.fn.tokenInput = function (url_or_data, options) {
    var settings = $.extend({}, DEFAULT_SETTINGS, options || {});
    return this.each(function () {
        new $.TokenList(this, url_or_data, settings);
    });
};
/*
// Expose the .tokenInput function to jQuery as a plugin NEW
$.fn.tokenInput = function (method) {
    // Method calling and initialization logic
    if(methods[method]) {
        return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
    } else {
        return methods.init.apply(this, arguments);
    }
};
*/

// TokenList class for each input
$.TokenList = function (input, url_or_data, settings) {

    //
    // Initialization
    //
    // Configure the data source
    if($.type(url_or_data) === "string") {
        // Set the url to query against
        settings.url = url_or_data;

        // Make a smart guess about cross-domain if it wasn't explicitly specified
        if(settings.crossDomain === undefined) {
            if(settings.url.indexOf("://") === -1) {
                settings.crossDomain = false;
            } else {
                settings.crossDomain = (location.href.split(/\/+/g)[1] !== settings.url.split(/\/+/g)[1]);
            }
        }
    } else if($.type(url_or_data) === "array") {
        // Set the local data to search through
        settings.local_data = url_or_data;
    }

    // Build class names
    if(settings.classes) {
        // Use custom class names
        settings.classes = $.extend({}, DEFAULT_CLASSES, settings.classes);
    } else if(settings.theme) {
        // Use theme-suffixed default class names
        settings.classes = {};
        $.each(DEFAULT_CLASSES, function(key, value) {
            settings.classes[key] = value + "-" + settings.theme;
        });
    } else {
        settings.classes = DEFAULT_CLASSES;
    }

	// Save last dropdown for submit button processing
	var last_dropdown = null;

    // Save the tokens
    var saved_tokens = [];

    // Keep track of the number of tokens in the list
    var token_count = 0;

    // Basic cache to save on db hits
    var cache = new $.TokenList.Cache();

    // Keep track of the timeout, old vals
    var timeout;
    var input_val;

	if(settings.placeholderText !== null) hidTokenFirst='style="display:none; vertical-align:middle;"';
	else hidTokenFirst='';

    // Create a new text input an attach keyup events
    var input_box = $("<input class=\"ac_input\" type=\"text\" "+hidTokenFirst+" autocomplete=\"off\">")
        .css({
            outline: "none"
        })
        .focus(function () {
            if (settings.tokenLimit === null || settings.tokenLimit !== token_count) {
                show_dropdown_hint();
            }
			if(settings.linkedText){
				$(this).val('');
                run_search('');
			}
            if (settings.showDropdownOnFocus) {
                //show_dropdown();
                run_search('');
            }
			//alert('@'.charCodeAt(0));
        })
        .blur(function () {
			if(settings.placeholderText !== null){
				input_box.hide();
				aLinked.show();
			}
            hide_dropdown();
        })
        .bind("keyup keydown blur update", resize_input)
        .keydown(function (event) {
            var previous_token;
            var next_token;

            switch(event.keyCode) {

                case KEY.LEFT:
                case KEY.RIGHT:
                case KEY.UP:
                case KEY.DOWN:
                    if(!$(this).val()) {
                        previous_token = input_token.prev();
                        next_token = input_token.next();

                        if((previous_token.length && previous_token.get(0) === selected_token) || (next_token.length && next_token.get(0) === selected_token)) {
                            // Check if there is a previous/next token and it is selected
                            if(event.keyCode === KEY.LEFT || event.keyCode === KEY.UP) {
                                deselect_token($(selected_token), POSITION.BEFORE);
                            } else {
                                deselect_token($(selected_token), POSITION.AFTER);
                            }
                        } else if((event.keyCode === KEY.LEFT || event.keyCode === KEY.UP) && previous_token.length) {
                            // We are moving left, select the previous token if it exists
                            select_token($(previous_token.get(0)));
                        } else if((event.keyCode === KEY.RIGHT || event.keyCode === KEY.DOWN) && next_token.length) {
                            // We are moving right, select the next token if it exists
                            select_token($(next_token.get(0)));
                        }
                    } else {
                        var dropdown_item = null;

                        if(event.keyCode === KEY.DOWN || event.keyCode === KEY.RIGHT) {
                            dropdown_item = $(selected_dropdown_item).next();
                            //console.log(dropdown_item);
                            if (dropdown_item.hasClass('heading')) {
                                dropdown_item = $(selected_dropdown_item).next().next();
                                //console.log('==');
                                //console.log(dropdown_item);
                            }
                        } else {
                            dropdown_item = $(selected_dropdown_item).prev();
                            //console.log(dropdown_item);
                            if (dropdown_item.hasClass('heading')) {
                                dropdown_item = $(selected_dropdown_item).prev().prev();
                                //console.log('==');
                                //console.log(dropdown_item);
                            }
                        }

                        if(dropdown_item.length) {
                            select_dropdown_item(dropdown_item);
                        }
                        return false;
                    }
                    break;

                case KEY.BACKSPACE:
                    previous_token = input_token.prev();

                    if(!$(this).val().length) {
                        if(selected_token) {
                            delete_token($(selected_token));
                        } else if(previous_token.length) {
                            select_token($(previous_token.get(0)));
                        }

                        return false;
                    } else if($(this).val().length === 1) {
                        hide_dropdown();
                    } else {
                        // set a timeout just long enough to let this function finish.
                        setTimeout(function(){do_search();}, 5);
                    }
                    break;

                case KEY.TAB:
                case KEY.ENTER:
                case KEY.NUMPAD_ENTER:
                case KEY.COMMA:
                  if (settings.allowInsert) {
                      var new_token = insert_token('0',$(this).val());
                      settings.onAdd(new_token);

                  }
                  if(selected_dropdown_item && !settings.redirectOnClick) {
                    add_token($(selected_dropdown_item));
                    return false;
                  }
                  else if(selected_dropdown_item && settings.redirectOnClick) {
                      //console.log(selected_dropdown_item);
                      //$(selected_dropdown_item).find('a').trigger('click');
                      window.location.replace($(selected_dropdown_item).find('a').attr('href'));
                      return false;
                  }
                  break;

                case KEY.ESCAPE:
                  hide_dropdown();
                  return true;

                default:
                    if(String.fromCharCode(event.which)) {
                        // set a timeout just long enough to let this function finish.
                        setTimeout(function(){do_search();}, 5);
                    }
                    break;
            }
        });

    // Keep a reference to the original input box
    var hidden_input = $(input)
                           .hide()
                           .val("")
                           .focus(function () {
                               input_box.focus();
                           })
                           .blur(function () {
                               input_box.blur();
                           });

    // Keep a reference to the selected token and dropdown item
    var selected_token = null;
    var selected_dropdown_item = null;

    // The list to store the token items in
    var token_list = $("<ul />")
        .addClass(settings.classes.tokenList)
        .click(function (event) {
            var li = $(event.target).closest("li");
            if(li && li.get(0) && $.data(li.get(0), "tokeninput")) {
                toggle_select_token(li);
            } else {
                // Deselect selected token
                if(selected_token) {
                    deselect_token($(selected_token), POSITION.END);
                }

				if(settings.placeholderText !== null){
					aLinked.hide();
					input_box.show();
				}

                // Focus input box
                input_box.focus();
            }
        })
        .mouseover(function (event) {
            var li = $(event.target).closest("li");
            if(li && selected_token !== this) {
                li.addClass(settings.classes.highlightedToken);
            }
        })
        .mouseout(function (event) {
            var li = $(event.target).closest("li");
            if(li && selected_token !== this) {
                li.removeClass(settings.classes.highlightedToken);
            }
        })
        .insertBefore(hidden_input);

    // The token holding the input box
	var input_token = $("<li />")
        .addClass(settings.classes.inputToken)
        .appendTo(token_list)
        .append(input_box);

    // The list to store the dropdown items in
    var dropdown = $("<div>")
        .addClass(settings.classes.dropdown)
        .appendTo("body")
        .hide();

    // Magic element to help us resize the text input
    var input_resizer = $("<tester/>")
        .insertAfter(input_box)
        .css({
            position: "absolute",
            top: -9999,
            left: -9999,
            width: "auto",
            fontSize: input_box.css("fontSize"),
            fontFamily: input_box.css("fontFamily"),
            fontWeight: input_box.css("fontWeight"),
            letterSpacing: input_box.css("letterSpacing"),
            whiteSpace: "nowrap"
        });

	//linkedText
	//if(settings.linkedText){
    if(settings.placeholderText !== null) {
        if (settings.linkedText) {
            var aLinked = $('<a />')
                .addClass('linkedToken')
                .appendTo(input_token)
                .prepend(settings.placeholderText)
                .click(function(){
                    aLinked.hide();
                    input_box.show();
                    input_box.focus();
                });
        } else {
            var aLinked = $('<span />')
                .addClass('autocomplete_placeholder')
                .appendTo(input_token)
                .prepend(settings.placeholderText)
                .click(function(){
                    aLinked.hide();
                    input_box.show();
                    input_box.focus();
                });
        }
    };


    // Pre-populate list if items exist
    hidden_input.val("");
    li_data = settings.prePopulate || hidden_input.data("pre");
    if(li_data && li_data.length) {
        $.each(li_data, function (index, value) {
            insert_token(value.id, value.name);
        });
    }



    //
    // Private functions
    //

    function resize_input() {
        if(input_val === (input_val = input_box.val())) {return;}

        // Enter new content into resizer and resize input accordingly
        var escaped = input_val.replace(/&/g, '&amp;').replace(/\s/g,' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        input_resizer.html(escaped);
        input_box.width(input_resizer.width() + 30);
    }

    function is_printable_character(keycode) {
        return ((keycode >= 48 && keycode <= 90) ||     // 0-1a-z
                (keycode >= 96 && keycode <= 111) ||    // numpad 0-9 + - / * .
                (keycode >= 186 && keycode <= 192) ||   // ; = , - . / ^
                (keycode >= 219 && keycode <= 222));    // ( \ ) '
    }

    // Inner function to a token to the list
    function insert_token(id, value) {
		var token_contents;
		if (settings.selectiveColor) {
			token_contents = "<p style=color: #"+id+">"+ value +"</p>";
		}
		else {
			token_contents = "<p>"+ value +"</p>";
		}
		var this_token;
		if (settings.selectiveColor) {
			this_token = $("<li><p style='color: "+getTextColor(id)+"'>"+ value +"</p> </li>")
			  .addClass(settings.classes.token)
			  .css('background-color','#'+id)
			  .insertBefore(input_token).fadeIn();
		} else {
			this_token = $("<li><p>"+ value +"</p> </li>")
			  .addClass(settings.classes.token);
            this_token.hide();
			this_token.insertBefore(input_token).fadeIn();
		}

        // The 'delete token' button
        $("<span>" + settings.deleteText + "</span>")
            .addClass(settings.classes.tokenDelete)
            .appendTo(this_token)
            .click(function () {
                delete_token($(this).parent());
                return false;
            });

        // Store data on the token
        var token_data = {"id": id, "name": value};
        $.data(this_token.get(0), "tokeninput", token_data);

        // Save this token for duplicate checking
        saved_tokens.push(token_data);

        // Update the hidden input
        var token_ids = $.map(saved_tokens, function (el) {
            return el.id;
        });
        hidden_input.val(token_ids.join(settings.tokenDelimiter));

        token_count += 1;

        return this_token;
    }

    // Add a token to the token list based on user input
    function add_token (item) {
	//alert(item.html());
        //console.log(item);
        //console.log($.data);
        var li_data = $.data(item.get(0), "tokeninput");
        var callback = settings.onAdd;
        //alert('adding');
        // See if the token already exists and select it if we don't want duplicates
        if(token_count > 0 && settings.preventDuplicates) {
            var found_existing_token = null;
            token_list.children().each(function () {
                var existing_token = $(this);
                var existing_data = $.data(existing_token.get(0), "tokeninput");
                if(existing_data && existing_data.id === li_data.id) {
                    found_existing_token = existing_token;
                    return false;
                }
            });

            if(found_existing_token) {
                select_token(found_existing_token);
                input_token.insertAfter(found_existing_token);
                input_box.focus();
                return;
            }
        }

        // Insert the new tokens
			if(!li_data) return false;
			if(li_data.id=='users' || li_data.id=='pages') return false;
			insert_token(li_data.id, li_data.name);

        // Check the token limit
        if(settings.tokenLimit !== null && token_count >= settings.tokenLimit) {
            input_box.hide();
            hide_dropdown();
            return;
        } else {
            input_box.focus();
        }

        // Clear input box
        input_box.val("");

        // Don't show the help dropdown, they've got the idea
        hide_dropdown();

        // Execute the onAdd callback if defined
        if($.isFunction(callback)) {
            callback(li_data);
        }
    }

    // Select a token in the token list
    function select_token (token) {
        token.addClass(settings.classes.selectedToken);
        selected_token = token.get(0);

        // Hide input box
        input_box.val("");

        // Hide dropdown if it is visible (eg if we clicked to select token)
        hide_dropdown();
    }

    // Deselect a token in the token list
    function deselect_token (token, position) {
        token.removeClass(settings.classes.selectedToken);
        selected_token = null;

        if(position === POSITION.BEFORE) {
            input_token.insertBefore(token);
        } else if(position === POSITION.AFTER) {
            input_token.insertAfter(token);
        } else {
            input_token.appendTo(token_list);
        }

        // Show the input box and give it focus again
        input_box.focus();
    }

    // Toggle selection of a token in the token list
    function toggle_select_token(token) {
        var previous_selected_token = selected_token;

        if(selected_token) {
            deselect_token($(selected_token), POSITION.END);
        }

        if(previous_selected_token === token.get(0)) {
            deselect_token(token, POSITION.END);
        } else {
            select_token(token);
        }
    }

    // Delete a token from the token list
    function delete_token (token) {
        // Remove the id from the saved list
        var token_data = $.data(token.get(0), "tokeninput");
        var callback = settings.onDelete;

        // Delete the token
        token.fadeOut(500);
        token.remove();
        selected_token = null;

        // Show the input box and give it focus again
        input_box.focus();

        // Remove this token from the saved list
        saved_tokens = $.grep(saved_tokens, function (val) {
            return (val.id !== token_data.id);
        });

        // Update the hidden input
        var token_ids = $.map(saved_tokens, function (el) {
            return el.id;
        });
        hidden_input.val(token_ids.join(settings.tokenDelimiter));

        token_count -= 1;

        if(settings.tokenLimit !== null) {
            input_box
                .show()
                .val("")
                .focus();
        }

        // Execute the onDelete callback if defined
        if($.isFunction(callback)) {
            callback(token_data);
        }
    }

    // Hide and clear the results dropdown
    function hide_dropdown () {
		last_dropdown = dropdown.html();
        dropdown.hide().empty();
        selected_dropdown_item = null;
    }
	function get_last_dropdown() {
		return last_dropdown;
	}

    function show_dropdown() {
        dropdown
            .css({
                position: "absolute",
                top: $(token_list).offset().top + $(token_list).outerHeight(),
                left: $(token_list).offset().left,
                zindex: 999
            })
            .show();
    }

    function show_dropdown_searching () {
        if(settings.searchingText) {
            dropdown.html("<p>"+settings.searchingText+"</p>");
            show_dropdown();
        }
    }

    function show_dropdown_hint () {
        if(settings.hintText) {
            dropdown.html("<p>"+settings.hintText+"</p>");
            show_dropdown();
        }
    }

    // Highlight the query part of the search term
    function highlight_term(value, term) {
        return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<b>$1</b>");
    }

    // Populate the results dropdown with some results
    function populate_dropdown (query, results) {
        if(results && results.length) {
            //dropdown.empty();
            var dropdown_ul = $("<ul>")
                .mouseover(function (event) {
                    select_dropdown_item($(event.target).closest("li"));
                })
                .mousedown(function (event) {
					//alert(settings.redirectOnClick);
					if (settings.redirectOnClick) {
						//alert($(event.target).closest("li").find('a').attr('href'))
						window.location.replace($(event.target).closest("li").find('a').attr('href'));
						//alert('hey');
					} else {
						add_token($(event.target).closest("li"));
					}
                    return false;
                })
                .hide();
            $.each(results, function(index, value){
				//alert(value.id+' '+value.name);
				if(value.type=='heading'){
					var this_li = $('<li class="heading">' + value.name + "</li>").appendTo(dropdown_ul);
				}

				else{
					if (settings.type === 'search') {
						var this_li = $('<li><div class="inlinediv"><img src="'+value.extra2+'" title="'+value.extra2+'" width="30" height="30" alt="" /></div><div class="inlinediv label"><a href="'+value.extra3+'">' + highlight_term(value.name, query) + '</a></div></li>').appendTo(dropdown_ul);
					} else {
						var this_li = $('<li>' + highlight_term(value.name, query) + '</li>').appendTo(dropdown_ul);
					}
				}
                if(index % 2) {
                    this_li.addClass(settings.classes.dropdownItem);
                } else {
                    this_li.addClass(settings.classes.dropdownItem2);
                }
				if(settings.selectiveColor) {
					this_li.css('background-color','#'+value.id);
					this_li.css('color',getTextColor(value.id));
				}

                if(index === 1) {
                    select_dropdown_item(this_li);
                }
                $.data(this_li.get(0), "tokeninput", {"id": value.id, "name": value.name});
            });
			if (settings.bottomText !== null) {
				var this_li = $('<li class="heading last">'+settings.bottomText+'</li>');
				if (settings.type === 'search') {
					var sq = this_li.find('a').attr('href');
					this_li.find('a').attr('href',sq+query);
					this_li.appendTo(dropdown_ul);
				} else {
					this_li.appendTo(dropdown_ul);
				}
			}
            dropdown.html(dropdown_ul);
            var is_dropdown_hidden = false;
            if (dropdown.is(':hidden')) {
                is_dropdown_hidden = true;
                show_dropdown();
            }

            if(settings.animateDropdown && is_dropdown_hidden) {
                dropdown_ul.slideDown("fast");
            } else {
                dropdown_ul.show();
            }
        } else {
            if(settings.noResultsText) {
                dropdown.html("<p>"+settings.noResultsText+"</p>");
                show_dropdown();
            }
        }
    }

    // Highlight an item in the results dropdown
    function select_dropdown_item (item) {
        if(item) {
            if(selected_dropdown_item) {
                deselect_dropdown_item($(selected_dropdown_item));
            }

            item.addClass(settings.classes.selectedDropdownItem);
            selected_dropdown_item = item.get(0);
        }
    }

    // Remove highlighting from an item in the results dropdown
    function deselect_dropdown_item (item) {
        item.removeClass(settings.classes.selectedDropdownItem);
        selected_dropdown_item = null;
    }

	function check_for_hash() {
		if (input_box.val().length === 1 && input_box.val() === '#') {
			return true;
		}
		return false;

	}


    // Do a search and show the "searching" dropdown if the input is longer
    // than settings.minChars
    function do_search() {
        console.log('do_search');
		var query = input_box.val().toLowerCase();
		if(query.length > 0) {
			if(query && query.length) {
				if(selected_token) {
					deselect_token($(selected_token), POSITION.AFTER);
				}

				if(query.length >= settings.minChars)
				{
                    if (settings.searchingText !== '') {
					    show_dropdown_searching();
                    }
					clearTimeout(timeout);
					timeout = setTimeout(function(){
						run_search(query);
					}, settings.searchDelay);
				}
				else
				{
					hide_dropdown();
				}
			}
		}
    }

    // Do the actual search
    function run_search(query) {
        var cached_results = cache.get(query);
        if(cached_results) {
            populate_dropdown(query, cached_results);
        } else {
            // Are we doing an ajax search or local data search?
            if(settings.url) {
                // Extract exisiting get params
                var ajax_params = {};
                ajax_params.data = {};
                if(settings.url.indexOf("?") > -1) {
                    var parts = settings.url.split("?");
                    ajax_params.url = parts[0];

                    var param_array = parts[1].split("&");
                    $.each(param_array, function (index, value) {
                        var kv = value.split("=");
                        ajax_params.data[kv[0]] = kv[1];
                    });
                } else {
                    ajax_params.url = settings.url;
                }

                // Prepare the request
                ajax_params.data[settings.queryParam] = query;
                ajax_params.type = settings.method;
                ajax_params.dataType = settings.contentType;
                if(settings.crossDomain) {
                    ajax_params.dataType = "json";
                }

                // Attach the success callback
                ajax_params.success = function(results) {
                  if($.isFunction(settings.onResult)) {
                      results = settings.onResult.call(this, results);
                  }
                  cache.add(query, settings.jsonContainer ? results[settings.jsonContainer] : results);

                  // only populate the dropdown if the results are associated with the active search query
                  //if(input_box.val().toLowerCase() === query) {
                      populate_dropdown(query, settings.jsonContainer ? results[settings.jsonContainer] : results);
                  //}
                };

                // Make the request
                $.ajax(ajax_params);
            } else if(settings.local_data) {
                // Do the search through local data
				/*
				$.each(settings.local_data, function(index, elt) {
					alert(elt.id);
				});
				*/
                console.log('local');
                console.log(settings.local_data);
                var results = $.grep(settings.local_data, function (row) {
                    return row.name.toLowerCase().indexOf(query.toLowerCase()) > -1;
                });
                populate_dropdown(query, results);
            }
        }
    }
};

// Really basic cache for the results
$.TokenList.Cache = function (options) {
    var settings = $.extend({
        max_size: 500
    }, options);

    var data = {};
    var size = 0;

    var flush = function () {
        data = {};
        size = 0;
    };

    this.add = function (query, results) {
        if(size > settings.max_size) {
            flush();
        }
        if(!data[query]) {
            size += 1;
        }
        data[query] = results;
    };

    this.get = function (query,is_profile){
        return data[query];
    };
}; 