    var app_options = {
        printing_enabled: false,
        face_step_fwd: 0,
        face_step_bwd: 0,
        now_playing: false
    };
    var child = make_child_window();
    child.addEventListener("load",function() {
        window.onunload = function() {
            if (child && !child.closed) {
                child.close();
            }
        };


        // Options
        // -------
        (function(){

            var handle = document.getElementById("handle");
            var controls = document.getElementById("controls");
            var mouse_initial = 0;
            var control_height = 100;
            var mouse_dragging = false;
            handle.addEventListener("mousedown", function(e){
                mouse_initial = e.y;
                mouse_dragging = true;
            }, false);
            document.addEventListener("mousemove", function(e){
                if (mouse_dragging) {
                    mouse_delta = -1 * (mouse_initial - e.y);
                    controls.style.height = mouse_delta + control_height + "px";
                    console.log(controls.style.height);
                }
            }, false);
            document.addEventListener("mouseup", function(e){
                if (mouse_dragging) {
                    mouse_dragging = false;
                    control_height = mouse_delta + control_height;
                }

            }, false);



            var printingcheckbox = document.getElementById("enableprint");
            printingcheckbox.addEventListener("click", function(cb){
                app_options.printing_enabled = this.checked;
            }, false);


            var facetscheckbox = document.getElementById("enablevideo");
            var facets = document.getElementById("facets");
            facetscheckbox.addEventListener("click", function(cb){
                if (this.checked) {
                    facets.style.visibility = "visible";
                }
                else facets.style.visibility = "";
            }, false);


            var facestepsliderfwd = document.getElementById("facestepsliderfwd");
            facestepsliderfwd.addEventListener("change", function(slider){
                app_options.face_step_fwd = parseFloat(this.value);
            }, false);

            var facestepsliderbwd = document.getElementById("facestepsliderbwd");
            facestepsliderbwd.addEventListener("change", function(slider){
                app_options.face_step_bwd = parseFloat(this.value);
            }, false);


            var playpause = document.getElementById("playpause");
            playpause.addEventListener("click", function(cb){
                if (app_options.now_playing) {
                    app_options.now_playing = false;
                    playpause.innerHTML = "Start";
                }
                else {
                    app_options.now_playing = true;
                    playpause.innerHTML = "Pause";
                    tick();
                    changeQuote();
                }
            }, false);


            app_options.face_step_fwd = parseFloat(facestepsliderfwd.value);
            app_options.face_step_bwd = parseFloat(facestepsliderbwd.value);
            app_options.printing_enabled = printingcheckbox.checked;

        })();


        var video = document.getElementById('webcam');
        var canvas = document.getElementById('canvas');
        var grid = document.getElementById('facets');
        var log = document.getElementById('log');




        try {
            compatibility.getUserMedia({video: true}, function(stream) {
                try {
                    video.src = compatibility.URL.createObjectURL(stream);
                } catch (error) {
                    video.src = stream;
                }
                setTimeout(function() {
                        video.play();
                        demo_app();
                    
                        compatibility.requestAnimationFrame(tick);
                    }, 500);
            }, function (error) {
                log.innerHTML = '<h4>Unable to get access to your WebCam.</h4>';
            });
        } catch (error) {
            log.innerHTML = '<h4>Fatal Error.</h4>';
        }





        var stat = new profiler();

        var gui,options,ctx,gridCtx;
        var img_u8, face_img_u8, corners, threshold;

        var demo_opt = function(){
            this.threshold = 10;
            this.resolution = 0.3;
            this.draw_borders = false;
        }


        function demo_app() {

            options = new demo_opt();
            //gui = new dat.GUI();
            //gui.add(options, 'threshold', 5, 100).step(1);
            var setResolution = function(resolution) {
                var cwidth = Math.floor(640*resolution);
                var cheight = Math.floor(480*resolution);
                img_u8 = new jsfeat.matrix_t(cwidth, cheight, jsfeat.U8_t | jsfeat.C1_t);
                canvas.width = cwidth;
                canvas.height = cheight;
                var style = 'visibility: hidden; -webkit-transform: scale('+1/resolution+')';                   
                //canvas['style'] = PrefixFree.prefixCSS(style);
                canvas['style'] = style;
                gridCtx.setTransform(1/resolution,0,0,1/resolution,0,0);
                corners = [];
                var i = cwidth*cheight;
                while(--i >= 0) {
                    corners[i] = new jsfeat.point2d_t(0,0,0,0);
                    corners[i].triangles = [];
                }
            }


            stat.add("capture");
            stat.add("grayscale");
            stat.add("fast corners");
            stat.add("triangles");
            stat.add("rendering");
            
            ctx = canvas.getContext('2d');
            gridCtx = grid.getContext('2d');

            setResolution(options.resolution);

            jsfeat.fast_corners.set_threshold(options.threshold);
            jsfeat.bbf.prepare_cascade(jsfeat.bbf.face_cascade);
        }
                    
        function tick() {
            
            if (app_options.now_playing) compatibility.requestAnimationFrame(tick);

            stat.new_frame();
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                var cwidth = Math.floor(640*options.resolution);
                var cheight = Math.floor(480*options.resolution);




                // DRAW FRAME
                // ----------

                stat.start("capture");
                ctx.drawImage(video, 0, 0, cwidth, cheight);
                var imageData = ctx.getImageData(0, 0, cwidth, cheight);
                stat.stop("capture");



                // CONVERT TO GRAYSCALE
                // --------------------
                stat.start("grayscale");
                jsfeat.imgproc.grayscale(imageData.data, img_u8.data);
                //jsfeat.imgproc.box_blur_gray(img_u8.data, img_u8.data, 10, 0);
                stat.stop("grayscale");
                // ---------------------
                var data_u32 = new Uint32Array(imageData.data.buffer);
                var alpha = (0xff << 24);
                var i = img_u8.cols*img_u8.rows, pix = 0;
                while(--i >= 0) {
                    pix = img_u8.data[i];
                    data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix;
                }
            


                // DETECT FACES
                // ------------
                var pyr = jsfeat.bbf.build_pyramid(img_u8, 24*2, 24*2, 4);
                var rects = jsfeat.bbf.detect(pyr, jsfeat.bbf.face_cascade);
                rects = jsfeat.bbf.group_rectangles(rects, 1);




                // DETECT CORNERS
                // ------------
                if(threshold != options.threshold) {
                    threshold = options.threshold|0;
                    jsfeat.fast_corners.set_threshold(threshold);
                }
                stat.start("fast corners");
                var count = jsfeat.fast_corners.detect(img_u8, corners, 5);
                stat.stop("fast corners");




                // TRIANGULATE
                // --------

                stat.start("triangles");
                var vertices = [];//{x:0,y:0},{x:cwidth,y:0},{x:cwidth,y:cheight},{x:0,y:cheight}];
                for(var i=0;i<count;i++) {
                    vertices.push(corners[i]);
                }
                var triangles = triangulate(vertices);

                update_d3(vertices);

                stat.stop("triangles");



                function getTriangleColor(img,triangle) {
                    var getColor = function (point) {
                        var offset = (point.x+point.y*cwidth)*4;
                        return img.data[offset];
                    }
                    var midPoint = function (point1,point2) {
                        return {x:(point1.x+point2.x)/2,
                                y:(point1.y+point2.y)/2};
                    }
                    // Pick a point inside the triangle
                    var point1 = midPoint(triangle.a,triangle.b);
                    var point = midPoint(point1,triangle.c);
                    return getColor({x:Math.floor(point.x),y:Math.floor(point.y)});
                }


                // RENDER
                // ------

                stat.start("rendering");

                var face_w = draw_faces(gridCtx, rects, cwidth/img_u8.cols, 1, canvas.width);
                face_detected_update(face_w);

                gridCtx.scale(-1, 1);
                gridCtx.fillStyle = 'rgb(255,255,255)';
                gridCtx.fillRect ( 0 , 0 , canvas.width , canvas.height);

                for(var i=0;i<triangles.length;i++) {
                    var color = triangles[i].color = getTriangleColor(imageData,triangles[i]);

                    var blueness = 255;
                    if (color < 125) blueness -= (125 - color);

                    gridCtx.fillStyle = 'rgba('+
                        blueness+','+
                        color+','+
                        255+','+
                        0.8 + ')';

                    gridCtx.beginPath();
                        gridCtx.moveTo(canvas.width - triangles[i].a.x,triangles[i].a.y);
                        gridCtx.lineTo(canvas.width - triangles[i].b.x,triangles[i].b.y);
                        gridCtx.lineTo(canvas.width - triangles[i].c.x,triangles[i].c.y);
                    gridCtx.closePath();

                    // gridCtx.setLineDash([1,5]);
                    // gridCtx.lineWidth = 0.1;
                    // gridCtx.strokeStyle = 'purple';
                    // gridCtx.stroke();

                    gridCtx.fill();
                    //gridCtx.fillStyle = 'rgb(255,255,255)';
                    //gridCtx.fillRect(triangles[i].a.x,triangles[i].a.y, 1, 1);
                }

                gridCtx.strokeStyle = 'cyan';

                gridCtx.scale(1, 1);

                stat.stop("rendering");

                // log.innerHTML = stat.log();
            }
        }
        






        // D3 
        // -------

        var sc = 4;
        var width = 1200,
            height = 800;
        //var svg = d3.select("#wrapper").append("svg")
        var svg = d3.selectAll([document.getElementById("#wrapper"), child.document.body]).append("svg")
            .attr("id", "meshsvg")
            .attr("width", width)
            .attr("height", height);
        var d3_geom_voronoi = d3.geom.voronoi().x(function(d) { return d.x; }).y(function(d) { return d.y; })
        var link = svg.selectAll("line");

       function update_d3(nodes) {

            link = link.data(d3_geom_voronoi.links(nodes))
            link.enter().append("line")
            link
                .attr("x1", function(d) { return d.source.x * sc; })
                .attr("y1", function(d) { return d.source.y * sc; })
                .attr("x2", function(d) { return d.target.x * sc; })
                .attr("y2", function(d) { return d.target.y * sc; })

            link.exit().remove()
       }








        // Quotes
        // ------

        var quotes = [
            ' “It’s constant movement, only it’s bigger, and it has more of a purpose. And it’s trying to figure out what the purpose is that interests me.” ',
            ' “I like to look at what everyone is doing, find some common thing they’re all assuming, implicitly, but they don’t even realize they’re assuming, and then negate that thing.” ',
            ' “I think there’s some deeper-seated thing in understanding life by building something that is lifelike.” ',
            ' “I sort of this joke theory that consciousness was put there by God so he has this quick interface to find out what we’re thinking about.” ',
            ' “In its ultimate form all of this stuff is looking at other ... That feeling that you are in the presence of life that would exist irrelevant of yourself.” ',
            ' “The whole concept of stability is a concept of death. You’re either prey, you’re an an enemy, or ignored.” ',
            ' “Together, they performed some global task, much bigger than the sum of the parts.” ',
            ' “There is a moment of contact— I know you are. You know I am. It’s not something that happens everyday. You have to go out and look for it.” ',
            ' “You know people are afraid of new, different, strange, but to me it isn’t anything to be feared. It’s something to be wondered at, and looked at, and explored... Perhaps communicated with...” ',
            ' “You’re fighting the elements to try and get them to grow where you want them to grow, get them to do what you want them to do. It’s a constant battle all the time.” ',
            ' “You have to experience an injury. You have to experience chaos.” ',
            ' “Given a particular set of rules, what is the global behavior that emerges when you put them together? And the other way around, if you want a group task done, how can you synthesize a set of rules that will cause that task to happen?” ',
            ' “The only consciousness we’ve ever experienced is our own. I know I’m conscious, but I don’t know about anyone else.” ',
            ' “People just come and look. You wonder what they’re looking at.”  ',
            ' “Everything we think, everything in our thought processes is built around being in touch with reality. Even the word ‘touch’...” ',
            ' “Never let that bluff down.” ',
            ' “Just feel the force. Don’t try and control the robot, but feel how the world is going to control the robot.” ',
        ];

        var childquote = child.document.getElementById('quote');

        changeQuote();
        function changeQuote() {
            var newquote = quotes[Math.floor(Math.random() * quotes.length)];
            childquote.innerHTML = newquote;
            // if(app_options.now_playing) setTimeout(changeQuote, Math.random()* 300 + 50);
        }



        // Facial progress bar
        // ------------
        var progress = document.getElementById("faceprogress");
        var facesizeprogress = document.getElementById("facesizeprogress");
        var datetime = document.getElementById('datetime');
        var title = document.getElementById('title');
        var face_log = document.getElementById("facesizelog");
        var progress_value = 0;
        var progress_max = 100;
        var printer_paused = false;
        function face_detected_update(face_w) {

            // var there_is_a_face = (face_w > 0.05 && !printer_paused);

            if (face_w > 0.05) {
                changeQuote();

                if (!printer_paused) {
                    progress_value += app_options.face_step_fwd;
                }
                else {
                    progress_value -= app_options.face_step_bwd;
                }
            }


            if (progress_value < 0) progress_value = 0;
            else if (progress_value > progress_max) {
                progress_value = 0;


                // Randomize positions
                // -------------------

                facets.style.top = (Math.random() * 5 + 4) + "in";
                facets.style.right = (Math.random() * 2) + "in";
                datetime.innerHTML = moment().format('h:mm:ss A — D MMMM YYYY');

                datetime.style.left = (Math.random() * 6.5) + "in";
                title.style.left = (Math.random() * 6.5) + "in";

                datetime.style.top = (Math.random() * 2 + 12) + "in";
                title.style.top = (Math.random() * 0.7) + "in";


                // Replace SVG from child window
                // -----------------------------
                var tempsvg = document.getElementById("meshsvg");
                var childsvg = child.document.getElementById("meshsvg");

                if (childsvg) {
                    if (tempsvg) {
                        tempsvg.parentNode.replaceChild(childsvg.cloneNode(), tempsvg);
                    }
                    else {
                        document.getElementById("wrapper").appendChild(childsvg.cloneNode());
                    }
                }


                // Replace quote from child window
                // -------------------------------
                document.getElementById("quote").innerHTML = childquote.innerHTML;

                // Print, if appropriate
                // ---------------------
                if (app_options.printing_enabled) window.print();
                else console.log("(printing!)");


                // Set printer-throttling timer
                // ----------------------------
                printer_paused = true;
                faceprogress.className = "paused";
                setTimeout(function(){
                    printer_paused = false;
                    faceprogress.className = "";
                }, 40 * 1000); // 40 second throttler

            } 
            progress.setAttribute("value", progress_value);
            facesizeprogress.setAttribute("value", face_w);
        }
        face_detected_update(false);





    // End window
    },false);




    function draw_faces(ctx, rects, sc, max, cwid) {
        var on = rects.length;
        if(on && max) {
            jsfeat.math.qsort(rects, 0, on-1, function(a,b){return (b.confidence<a.confidence);})
        }
        var n = max || on;
        n = Math.min(n, on);
        var r;
        for(var i = 0; i < n; ++i) {
            r = rects[i];
            ctx.strokeRect(
                (cwid - r.x*sc - r.width*sc)|0,
                (r.y*sc)|0,
                (r.width*sc)|0,
                (r.height*sc)|0
            );

            return range_to_one(r.width, [22,60]);
        }
    }




    // Make Child Window
    // -----------------


    function make_child_window() {
        var url = "http://localhost:8000/child.html";
        var width = 1200;
        var height = 800;
        var left = parseInt((screen.availWidth/2) - (width/2));
        var top = parseInt((screen.availHeight/2) - (height/2));
        var windowFeatures = "width=" + width + ",height=" + height +   
            ",status,resizable,left=" + left + ",top=" + top + 
            "screenX=" + left + ",screenY=" + top + ",scrollbars=yes";

        return window.open(url, "subWind", windowFeatures, "POS");
    }















    // 0-1 to Range and Range to 0-1
    // -----------------------------

    //        (b-a)(x - min)
    // f(x) = --------------  + a
    //           max - min

    function range_to_range (x, inp, out) {
        return ( ( (out[1] - out[0])*(x - inp[0]) ) / (inp[1] - inp[0]) + out[0] );
    }

    function one_to_range (x, output_range) {
        return range_to_range(x, [0,1], output_range);
    }

    function range_to_one (x, input_range) {
        return range_to_range(x, input_range, [0,1]);
    }


