define(['cdn.underscore','cdn.jquery'], function(){
var cdn = {};
cdn.underscore = arguments[0];
cdn.jquery = arguments[1];
/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());
define('text',{load: function(id){throw new Error("Dynamic load not allowed: " + id);}});

define('text!whiteboard.html',[],function () { return '<link href="http://maxcdn.bootstrapcdn.com/font-awesome/4.1.0/css/font-awesome.min.css" rel="stylesheet">\n\n<div class="content">\n\n  <div class="slides clearfix">\n    <div class="slide current" data-slide="1">\n\n      <div class="menu clearfix">\n        <nav>\n          <div class="col col-4">\n            <% if (editable || (!editable && learner.canRecord)) { %><li><button class="btn btn-default record" type="button"><i class="fa fa-circle"></i> Record</button></li><% } %>\n            <li><button class="btn btn-default play disabled" type="button"><i class="fa fa-play"></i> Play</button></li>\n          </div>\n          <div class="col col-4 text-center">Slide <span class="text current-slide">1</span> of <span class="text total-slides">1</span></div>\n          <div class="col col-4">\n            <% if (editable || (!editable && learner.canDraw)) { %><li class="right"><button class="btn btn-default clear" type="button">Clear Canvas</button></li><% } %>\n          </div>\n        </nav>\n      </div>\n\n      <div class="canvas">\n        <canvas class="sketchpad"></canvas>\n        <div class="controls clearfix">\n          <% if (editable || (!editable && learner.canDraw)) { %>\n          <div class="grouped">\n            <li><span class="circle small" data-width="6"></span></li>\n            <li class="selected"><span class="circle medium" data-width="9"></span></li>\n            <li><span class="circle large" data-width="13"></span></li>\n          </div>\n          <div class="grouped">\n            <li class="selected"><span class="color black" data-color="#444"></span></li>\n            <li><span class="color red" data-color="#e74c3c"></span></li>\n            <li><span class="color orange" data-color="#e67e22"></span></li>\n            <li><span class="color yellow" data-color="#f1c40f"></span></li>\n            <li><span class="color green" data-color="#2ecc71"></span></li>\n            <li><span class="color blue" data-color="#3498db"></span></li>\n          </div>\n          <li><span class="icon erase"><i class="fa fa-eraser"></i></span></li>\n          <li><span class="icon add image"><i class="fa fa-picture-o"></i></span></li>\n          <li><span class="icon add text"><i class="fa fa-font"></i></span></li>\n          <% } %>\n\n          <% if (editable || (!editable && learner.canSlides)) { %><li class="right"><span class="icon remove-slide"><i class="fa fa-minus"></i></span><span class="icon add new-slide"><i class="fa fa-plus"></i></span></li><% } %>\n          <li class="right"><span class="icon traverse forward disabled"><i class="fa fa-chevron-right"></i></span></li>\n          <li class="right"><span class="icon traverse backward disabled"><i class="fa fa-chevron-left"></i></span></li>\n        </div>\n        <div class="sub-controls clearfix">\n          <div class="text-controls">\n            <li class="large"><input type="text" class="text-text"></li>\n            <li class="medium">x <input type="text" class="text-pos x"></li>\n            <li class="medium">y <input type="text" class="text-pos y"></li>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n</div>';});

define(
  'gadget',["cdn.underscore", "cdn.jquery", "text!whiteboard.html"], 
  function(_, $, tpl){

    var Gadget = function(options) {
      this.$el = options.$el;
      this.player = options.player;
      this.config = options.config;
      this.userState = options.userState;
      this.Playbacks = [];
      this.Texts = [];
      
      options.propertySheetSchema.set('Learner canvas privileges', { type: "Checkboxes", 
        options: 
        [
          {val: "can_draw", label: "Can draw"}, 
          {val: "can_record", label: "Can record"}
        ]
      });

      this.update(options.config);

      this.player.on('toggleEdit', this.toggleEdit, this);
      this.config.on('change:Learner canvas privileges', this.update, this);
      this.player.on('domReady', this.render, this);
    };

    Gadget.prototype.update = function() {
      this.learner = this.config.get('Learner canvas privileges');
      if(!this.learner) this.learner = [];
      this.render(true);
    };

    Gadget.prototype.render = function(editable) {
      
      var self = this;
      var $el = this.$el;
      var existingSlides = this.config.get('slides');
      var learnerObject = {
        canDraw: false,
        canRecord: false
      };

      for(i=0; i<this.learner.length; i++) {

        if(this.learner[i]=="can_draw") learnerObject.canDraw = true;
        if(this.learner[i]=="can_record") learnerObject.canRecord = true;
      }

      // Initialize template
      this.template = _.template(tpl, {
        editable: editable,
        learner: learnerObject
      });

      // Load template
      $el.html(this.template);

      // Initialize first slide's canvas
      self.canvas($el.find('.slide.current'), (editable || (!editable && learnerObject.canDraw)));

      // Load any saved slides
      if(existingSlides && existingSlides.length) {

        for(i=0; i<existingSlides.length; i++) {

          if(existingSlides[i].imageData != undefined) {

            var thiscanvas;
            var $slide;

            if(i==0) {

              $slide = $el.find('.slide.current');
              thiscanvas = $slide.find('.sketchpad')[0];

            } else {

              $slide = $el.find('.slide.current').clone();

              self.canvas($slide, (editable || (!editable && learnerObject.canDraw)));

              $el.find('.slides').append( $slide ).css('width', $el.find('.slides').width()+704);

              $slide.removeClass('current').data('slide', i+1).find('.text.current-slide').html(i+1);

              $($el.find('.slides .slide')[i-1]).find('.traverse.forward').removeClass('disabled');

              $slide.find('.btn.play').addClass('disabled');

              if(editable) {
                $($el.find('.slides .slide')[i-1]).find('.remove-slide').show();

                if(existingSlides[i+1]) {
                  $($el.find('.slides .slide')[i-1]).find('.new-slide').hide();
                }
              }

              $slide.find('.traverse.backward').removeClass('disabled');

              thiscanvas = $slide.find('.sketchpad')[0];
            }

            if(existingSlides[i].texts) {

              for(t = 0; t<existingSlides[i].texts.length; t++) {

                $text = $('<div class="text-box">').html(existingSlides[i].texts[t].text).css('top', existingSlides[i].texts[t].y).css('left', existingSlides[i].texts[t].x).data('i', t);

                $slide.find('.canvas').append($text);

              }
            }

            if(existingSlides[i].playback) {
                
              $slide.find('.btn.play').removeClass('disabled');

              self.Playbacks[i+1] = existingSlides[i].playback;
            }

            var thisctx = thiscanvas.getContext('2d');

            thisctx.putImageData(existingSlides[i].imageData,0,0);

            $el.find('.text.total-slides').html(existingSlides.length);
          }
        }
      }

      // Adding a slide
      $el.on("click", '.add.new-slide', function(e) {

        var $old = $el.find('.slide.current');        
        var $new = $old.clone();
        var current = $el.find('.slides .slide').length+1;

        $old.removeClass('current');

        $new.addClass('current').data('slide', current);

        $el.find('.slides').append( $new ).css('width', $el.find('.slides').width()+704);

        $new.find('.text.current-slide').html(current);
        $el.find('.text.total-slides').html($el.find('.slides .slide').length);

        $new.find('.traverse.backward').removeClass('disabled');
        $old.find('.traverse.forward').removeClass('disabled');

        $new.find('.btn.play').addClass('disabled');

        $old.find('.add.new-slide').hide();
        $old.find('.remove-slide').show();

        self.canvas($el.find('.slide.current'), (editable || (!editable && learnerObject.canDraw)));

        e.stopImmediatePropagation();
      })
      // Removing a slide
      .on("click", '.remove-slide', function(e) {

        $el.find('.slide.current').remove();

        var i = $(this).closest('.slide').data('slide');

        var $slides = $el.find('.slides .slide');

        $( $slides[i-1] ).addClass('current');

        $( $slides[0] ).find('.traverse.backward').addClass('disabled');
        $( $slides[$slides.length-1] ).find('.traverse.forward').addClass('disabled');

        $el.find('.text.total-slides').html($el.find('.slides .slide').length);

        $slides.each(function(i) {

          $(this).find('.text.current-slide').html(i+1);
        })

        e.stopImmediatePropagation();

      })
      // Traversing slides
      .on("click", '.traverse.backward', function(e) {

        if(!$(this).hasClass('disabled')) {

          var $slides = $el.find('.slides .slide');

          var i = $(this).closest('.slide').data('slide');

          $( $slides[i-1] ).removeClass('current');

          $( $slides[i-2] ).addClass('current');
        }

        e.stopImmediatePropagation();
      })
      .on("click", '.traverse.forward', function(e) {

        if(!$(this).hasClass('disabled')) {

          var $slides = $el.find('.slides .slide');

          var i = $(this).closest('.slide').data('slide');

          $( $slides[i-1] ).removeClass('current');

          $( $slides[i] ).addClass('current');
        }

        e.stopImmediatePropagation();
      });
    };

    Gadget.prototype.toggleEdit = function(editable) {

      var self = this;

      if(!editable) {
      
        var slides = [];

        this.$el.find('.slides .slide').each(function() {

          var canvas = $(this).find('.sketchpad')[0];
          var ctx = canvas.getContext('2d');

          var imageData = ctx.getImageData(0,0,700,350);

          var playback = (self.Playbacks[$(this).data('slide')] != undefined ? self.Playbacks[$(this).data('slide')] : null);

          var texts = (self.Texts[$(this).data('slide')] != undefined ? self.Texts[$(this).data('slide')] : null);

          slides.push({imageData: imageData, playback: playback, texts: texts});
        });

        this.config.set('slides', slides);
        this.config.save();
      }

      this.render(editable);
    };

    Gadget.prototype.canvas = function($el, editable){

      var self = this;

      window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

      // get the canvas element and its context
      var lineW = $el.find('.selected .circle').data('width'),
          fillC = $el.find('.selected .color').data('color');

      function midPointBtw(p1, p2) {
        return {
          x: p1.x + (p2.x - p1.x) / 2,
          y: p1.y + (p2.y - p1.y) / 2
        };
      }

      var canvas = $el.find('.sketchpad')[0];
      var ctx = canvas.getContext('2d');

      var memCanvas = document.createElement('canvas');
      var memCtx = memCanvas.getContext('2d');

      var w = 700, h = 350;

      canvas.setAttribute("height", h);
      canvas.setAttribute("width", w);
      memCanvas.setAttribute("height", h);
      memCanvas.setAttribute("width", w);

      ctx.lineJoin = ctx.lineCap = 'round';

      var isDrawing, points = [];

      var CanvasRecording = false;
      var WhiteboardPlayback = [];
      var Playing, PlayingTO;
      var lastFill, Erasing = false;

      canvas.onmousedown = function(event) {
        
        if(Playing || !editable) return;

        isDrawing = true;

        ctx.lineWidth = lineW;
        ctx.fillStyle = fillC;
        ctx.strokeStyle = fillC;

        memCtx.clearRect(0, 0, w, h);
        memCtx.drawImage(canvas, 0, 0);

        var x,y;

        // get coordinates
        if (event.layerX || event.layerX == 0) { // Firefox
          x = event.layerX;
          y = event.layerY;
        } else if (event.offsetX || event.offsetX == 0) { // Opera
          x = event.offsetX;
          y = event.offsetY;
        }

        if(CanvasRecording) {
          
          if(WhiteboardPlayback.length && WhiteboardPlayback[0].type=="pause" && !WhiteboardPlayback[0].end_time) {
            WhiteboardPlayback[0].end_time = Date.now();
          }

          WhiteboardPlayback.unshift({type: "draw", start_time: Date.now(), start_point: {x:x,y:y}, points: [], stroke: {w: ctx.lineWidth, fill: ctx.fillStyle}, end_time: null});
          WhiteboardPlayback[0].points.push({ x: x, y: y });
        }

        points.push({ x: x, y: y });
      };

      canvas.onmousemove = function(event) {
        if (!isDrawing || Playing || !editable) return;

        var cx,cy;

        // get coordinates
        if (event.layerX || event.layerX == 0) { // Firefox
          cx = event.layerX;
          cy = event.layerY;
        } else if (event.offsetX || event.offsetX == 0) { // Opera
          cx = event.offsetX;
          cy = event.offsetY;
        }

        if(CanvasRecording) {
          WhiteboardPlayback[0].points.push({ x: cx, y: cy });
        }

        points.push({ x: cx, y: cy });

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.drawImage(memCanvas, 0, 0);
        
        var p1 = points[0];
        var p2 = points[1];
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);

        for (var i = 1, len = points.length; i < len; i++) {
          // we pick the point between pi+1 & pi+2 as the
          // end point and p1 as our control point
          var midPoint = midPointBtw(p1, p2);
          ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
          p1 = points[i];
          p2 = points[i+1];
        }
        // Draw last line as a straight line while
        // we wait for the next point to be able to calculate
        // the bezier control point
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      };

      canvas.onmouseup = function() {
        isDrawing = false;
        points.length = 0;
        memCtx.clearRect(0, 0, w, h);
        memCtx.drawImage(canvas, 0, 0);

        if(CanvasRecording) {
          WhiteboardPlayback[0].end_time = Date.now();
          WhiteboardPlayback.unshift({type:"pause", start_time: Date.now(), end_time: null});
        }
      };

      function Draw(p1, p2, p3, stroke, delay) {

        window.setTimeout(function() {
          
          ctx.lineWidth = stroke.w;
          ctx.fillStyle = stroke.fill;
          ctx.strokeStyle = stroke.fill;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);

          var midPoint = midPointBtw(p1, p2);
          ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);

          ctx.lineTo(p1.x, p1.y);

          if(p3) {
            var midPoint2 = midPointBtw(p2, p3);
            ctx.quadraticCurveTo(p2.x, p2.y, midPoint2.x, midPoint2.y);
            ctx.lineTo(p2.x, p2.y);
          }

          ctx.stroke();
        }, delay);
      }

      function Playback(obj) {

        var wi = obj.length;
        PlayingTO = null;

        while(wi--) {

          var duration = obj[wi].end_time - obj[wi].start_time;
          
          if(obj[wi].type=="pause") {

            var newPlayback = obj.slice(0, wi);

            if( obj[wi+1].type == "draw" ) {
              var drawtime = obj[wi+1].end_time - obj[wi+1].start_time;
            }

            PlayingTO = window.setTimeout(function() {
              Playback(newPlayback);
            }, duration+drawtime);
            break;
          }
          
          if(obj[wi].type=="draw") {
            
            for (var i = 1, len = obj[wi].points.length; i < len; i++) {
              Draw(obj[wi].points[i-1], obj[wi].points[i], obj[wi].points[i+1], obj[wi].stroke, (duration/obj[wi].points.length)*i);
            }
          }
        }

        if(!PlayingTO) {

          ctx.drawImage(memCanvas, 0, 0);

          $el.find('.btn.record').removeClass('disabled');
          $el.find('.btn.clear').removeClass('disabled');

          Playing = false;
        }
      }

      function showTextControls($text) {

        $el.find('.add.text').closest('li').addClass('selected');

        var $text_controls = $el.find('.sub-controls .text-controls');

        $text_controls.slideDown(200);

        $text_controls.find('.text-text').off("keyup").val( $text.text() ).focus()
          .on("keyup", function(e) {
            $text.html( $(this).val() );
            self.Texts[$el.data('slide')][$text.data('i')].text = $(this).val();
          }
        );

        $text_controls.find('.text-pos.x').off("keyup").val( $text.position().left )
          .on("keyup", function(e) {
            $text.css('left', parseInt($(this).val()) );
            self.Texts[$el.data('slide')][$text.data('i')].x = parseInt($(this).val());
          }
        );

        $text_controls.find('.text-pos.y').off("keyup").val( $text.position().top )
          .on("keyup", function(e) {
            $text.css('top', parseInt($(this).val()) );
            self.Texts[$el.data('slide')][$text.data('i')].y = parseInt($(this).val());
          }
        );
      }
        
      // button actions
      $el.on("click", '.btn.record', function(e) {

        if(!$(this).hasClass('disabled')) {
          if(CanvasRecording) {
           
            CanvasRecording = false;
            $(this).removeClass('recording');

            if(WhiteboardPlayback.length && WhiteboardPlayback[0].type=="pause") {
              WhiteboardPlayback[0].end_time = WhiteboardPlayback[0].start_time+100;
              self.Playbacks[$el.data('slide')] = {i: $el.data('slide'), playback: WhiteboardPlayback};
            }

            $el.find('.btn.play').removeClass('disabled');
            $el.find('.btn.clear').removeClass('disabled');

          } else {
           
            CanvasRecording = true;
            $(this).addClass('recording');
            $el.find('.btn.play').addClass('disabled');
            $el.find('.btn.clear').addClass('disabled');
          }
        }

        e.stopImmediatePropagation();
      })
      .on("click", '.btn.play', function(e) {
        
        if(!$(this).hasClass('disabled')) {
          
          Playing = true;

          canvas.width = canvas.width;
          
          Playback(self.Playbacks[$el.data("slide")].playback);

          $el.find('.btn.record').addClass('disabled');
          $el.find('.btn.clear').addClass('disabled');
        }

        e.stopImmediatePropagation();
      })
      .on("click", '.btn.clear', function() {
        
        if(!$(this).hasClass('disabled')) {

          canvas.width = canvas.width;
          memCanvas.width = canvas.width;
          WhiteboardPlayback = [];
          self.Playbacks[$el.data("slide")] = null;
          $el.find('.btn.play').addClass('disabled');
        }
      })
      .on("click", '.grouped li', function() {

        $(this).closest('.grouped').find('li').removeClass('selected');
        $(this).addClass('selected');

        lineW = $el.find('.selected .circle').data('width');
        
        if(!Erasing) {
          fillC = $el.find('.selected .color').data('color');
        } else {
          lastFill = $el.find('.selected .color').data('color');
        }

      })
      .on("click", '.erase', function() {

        if($(this).closest('li').hasClass('selected')) {

          $(this).closest('li').removeClass('selected');
          
          fillC = lastFill;
          Erasing = false;

          ctx.globalCompositeOperation = null;

        } else {

          $(this).closest('li').addClass('selected');

          lastFill = fillC;
          Erasing = true;

          ctx.globalCompositeOperation = "copy";
          fillC = "rgba(0,0,0,0)";
        }
      })
      .on("click", '.add.text', function(e) {

        if(!Playing) {

          if($(this).closest('li').hasClass('selected')) {

            $(this).closest('li').removeClass('selected');

            $el.find('.sub-controls .text-controls').slideUp(200);

          } else {

            var $text = $('<div class="text-box">').html('Hello World!').css('top', 100).css('left', 100);

            $el.find('.canvas').append( $text.data('i', self.Texts.length) );

            if(!self.Texts[$el.data('slide')]) self.Texts[$el.data('slide')] = [];

            self.Texts[$el.data('slide')].push({text: 'Hello World!', x: 100, y: 100});

            showTextControls($text);
          }
        }

        e.stopImmediatePropagation();
      })
      .on("click", '.text-box', function(e) {

        if(!isDrawing && !Playing) {

          showTextControls($(this));
        }
      });
    };

    return Gadget;
});

define('cdn.underscore', [], function(){ return cdn.underscore });
define('cdn.jquery', [], function(){ return cdn.jquery });
return require('gadget');});