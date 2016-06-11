/*Copyright (c) 2013-2016, Rob Schmuecker
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* The name Rob Schmuecker may not be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL MICHAEL BOSTOCK BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABIlocalLITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/

// Thank you Rob for your great work (@AshtonIzmev)


function initD3Tree(nlform, data) {
    // Get JSON data
    treeJSON = d3.json("data/data.json", function(error, treeData) {

        if (data) {
            treeData = data;
        }

        // Calculate total nodes, max label length
        var totalNodes = 0;
        var maxLabelLength = 0;
        // variables for drag/drop
        var selectedNode = null;
        var copiedNode = null;
        var hoverNode = null;
        var selectedMode = null;
        var draggingNode = null;
        // panning variables
        var panSpeed = 200;
        var panBoundary = 20; // Within 20px from edges will pan when dragging.
        // Misc. variables
        var i = 0;
        var duration = 750;
        var root;

        // size of the diagram
        var viewerWidth = $("#tree-container").width();
        var viewerHeight = $(document).height()-70;

        var tree = d3.layout.tree();

        // define a d3 diagonal projection for use by the node paths later on.
        var diagonal = d3.svg.diagonal()
            .projection(function(d) {
                return [d.y, d.x];
            });

        // A recursive helper function for performing some setup by walking through all nodes

        function visit(parent, visitFn, childrenFn) {
            if (!parent) return;

            visitFn(parent);

            var children = childrenFn(parent);
            if (children) {
                var count = children.length;
                for (var i = 0; i < count; i++) {
                    visit(children[i], visitFn, childrenFn);
                }
            }
        }

        // Call visit function to establish maxLabelLength
        visit(treeData, function(d) {
            totalNodes++;
            maxLabelLength = Math.max(d.name.length, maxLabelLength);

        }, function(d) {
            return d.children && d.children.length > 0 ? d.children : null;
        });


        // sort the tree according to the node names

        function sortTree() {
            tree.sort(function(a, b) {
                return b.name.toLowerCase() < a.name.toLowerCase() ? 1 : -1;
            });
        }
        // Sort the tree initially incase the JSON isn't in a sorted order.
        sortTree();

        // TODO: Pan function, can be better implemented.

        function pan(domNode, direction) {
            var speed = panSpeed;
            if (panTimer) {
                clearTimeout(panTimer);
                translateCoords = d3.transform(svgGroup.attr("transform"));
                if (direction == 'left' || direction == 'right') {
                    translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
                    translateY = translateCoords.translate[1];
                } else if (direction == 'up' || direction == 'down') {
                    translateX = translateCoords.translate[0];
                    translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
                }
                scaleX = translateCoords.scale[0];
                scaleY = translateCoords.scale[1];
                scale = zoomListener.scale();
                svgGroup.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
                d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
                zoomListener.scale(zoomListener.scale());
                zoomListener.translate([translateX, translateY]);
                panTimer = setTimeout(function() {
                    pan(domNode, speed, direction);
                }, 50);
            }
        }

        // Define the zoom function for the zoomable tree

        function zoom() {
            svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
        }


        // define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
        var zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3]).on("zoom", zoom);

        function initiateDrag(d, domNode) {
            draggingNode = d;
            d3.select(domNode).select('.ghostCircle').attr('pointer-events', 'none');
            d3.selectAll('.ghostCircle').attr('class', 'ghostCircle show');
            d3.select(domNode).attr('class', 'node activeDrag');

            svgGroup.selectAll("g.node").sort(function(a, b) { // select the parent and sort the path's
                if (a.id != draggingNode.id) return 1; // a is not the hovered element, send "a" to the back
                else return -1; // a is the hovered element, bring "a" to the front
            });
            // if nodes has children, remove the links and nodes
            if (nodes.length > 1) {
                // remove link paths
                links = tree.links(nodes);
                nodePaths = svgGroup.selectAll("path.link")
                    .data(links, function(d) {
                        return d.target.id;
                    }).remove();
                // remove child nodes
                nodesExit = svgGroup.selectAll("g.node")
                    .data(nodes, function(d) {
                        return d.id;
                    }).filter(function(d, i) {
                        if (d.id == draggingNode.id) {
                            return false;
                        }
                        return true;
                    }).remove();
            }

            // remove parent link
            parentLink = tree.links(tree.nodes(draggingNode.parent));
            svgGroup.selectAll('path.link').filter(function(d, i) {
                if (d.target.id == draggingNode.id) {
                    return true;
                }
                return false;
            }).remove();

            dragStarted = null;
        }

        // define the baseSvg, attaching a class for styling and the zoomListener
        d3.selectAll("#tree-container").select("svg").remove();
        var baseSvg = d3.select("#tree-container").append("svg")
            .attr("width", viewerWidth)
            .attr("height", viewerHeight)
            .call(zoomListener);


        // Define the drag listeners for drag/drop behaviour of nodes.
        dragListener = d3.behavior.drag()
            .on("dragstart", function(d) {
                if (d == root) {
                    return;
                }
                dragStarted = true;
                nodes = tree.nodes(d);
                d3.event.sourceEvent.stopPropagation();
                // it's important that we suppress the mouseover event on the node being dragged. Otherwise it will absorb the mouseover event and the underlying node will not detect it d3.select(this).attr('pointer-events', 'none');
            })
            .on("drag", function(d) {
                if (d == root) {
                    return;
                }
                if (dragStarted) {
                    domNode = this;
                    initiateDrag(d, domNode);
                }

                // get coords of mouseEvent relative to svg container to allow for panning
                relCoords = d3.mouse($('svg').get(0));
                if (relCoords[0] < panBoundary) {
                    panTimer = true;
                    pan(this, 'left');
                } else if (relCoords[0] > ($('svg').width() - panBoundary)) {

                    panTimer = true;
                    pan(this, 'right');
                } else if (relCoords[1] < panBoundary) {
                    panTimer = true;
                    pan(this, 'up');
                } else if (relCoords[1] > ($('svg').height() - panBoundary)) {
                    panTimer = true;
                    pan(this, 'down');
                } else {
                    try {
                        clearTimeout(panTimer);
                    } catch (e) {

                    }
                }

                d.x0 += d3.event.dy;
                d.y0 += d3.event.dx;
                var node = d3.select(this);
                node.attr("transform", "translate(" + d.y0 + "," + d.x0 + ")");
                updateTempConnector();
            }).on("dragend", function(d) {
                if (d == root) {
                    return;
                }
                domNode = this;
                if (selectedNode) {
                    // now remove the element from the parent, and insert it into the new elements children
                    var index = draggingNode.parent.children.indexOf(draggingNode);
                    if (index > -1) {
                        draggingNode.parent.children.splice(index, 1);
                    }
                    if (typeof selectedNode.children !== 'undefined' || typeof selectedNode._children !== 'undefined') {
                        if (typeof selectedNode.children !== 'undefined') {
                            selectedNode.children.push(draggingNode);
                        } else {
                            selectedNode._children.push(draggingNode);
                        }
                    } else {
                        selectedNode.children = [];
                        selectedNode.children.push(draggingNode);
                    }
                    // Make sure that the node being added to is expanded so user can see added node is correctly moved
                    expand(selectedNode);
                    sortTree();
                    endDrag();
                } else {
                    endDrag();
                }
            });

        function endDrag() {
            selectedNode = null;
            d3.selectAll('.ghostCircle').attr('class', 'ghostCircle');
            d3.select(domNode).attr('class', 'node');
            // now restore the mouseover event or we won't be able to drag a 2nd time
            d3.select(domNode).select('.ghostCircle').attr('pointer-events', '');
            updateTempConnector();
            if (draggingNode !== null) {
                update(root);
                centerNode(draggingNode);
                draggingNode = null;
            }
        }

        // Helper functions for collapsing and expanding nodes.

        function collapse(d) {
            if (d.children) {
                d._children = d.children;
                d._children.forEach(collapse);
                d.children = null;
            }
        }

        function expand(d) {
            if (d._children) {
                d.children = d._children;
                d.children.forEach(expand);
                d._children = null;
            }
        }

        var overCircle = function(d) {
            selectedNode = d;
            updateTempConnector();
        };
        var outCircle = function(d) {
            selectedNode = null;
            updateTempConnector();
        };

        // Function to update the temporary connector indicating dragging affiliation
        var updateTempConnector = function() {
            var data = [];
            if (draggingNode !== null && selectedNode !== null) {
                // have to flip the source coordinates since we did this for the existing connectors on the original tree
                data = [{
                    source: {
                        x: selectedNode.y0,
                        y: selectedNode.x0
                    },
                    target: {
                        x: draggingNode.y0,
                        y: draggingNode.x0
                    }
                }];
            }
            var link = svgGroup.selectAll(".templink").data(data);

            link.enter().append("path")
                .attr("class", "templink")
                .attr("d", d3.svg.diagonal())
                .attr('pointer-events', 'none');

            link.attr("d", d3.svg.diagonal());

            link.exit().remove();
        };

        // Function to center node when clicked/dropped so node doesn't get lost when collapsing/moving with large amount of children.

        function centerNode(source) {
            scale = zoomListener.scale();
            x = -source.y0;
            y = -source.x0;
            x = x * scale + viewerWidth / 4 ; // keep root node slightly on the left when loading
            y = y * scale + viewerHeight / 2;
            d3.select('g').transition()
                .duration(duration)
                .attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
            zoomListener.scale(scale);
            zoomListener.translate([x, y]);
        }

        // Toggle children function

        function toggleChildren(d) {
            if (d.children) {
                d._children = d.children;
                d.children = null;
            } else if (d._children) {
                d.children = d._children;
                d._children = null;
            }
            return d;
        }

        function deleteNode(d) {
            var childs = d.parent.children;
            for(i=0; i<childs.length; i++) {
                if (childs[i].id === d.id) {
                    childs.splice(i, 1);
                    return;
                }    
            }
        }

        function addNewNodeAt(d) {
            var newChild = {'parent': d, 
                'name': 'name', 'size': 3,
                'desc': 'description',
                'category': 'category'};
            if (d.children) {
                d.children.push(newChild);    
            } else {
                d.children = [newChild];
            }
        }

        function pasteNodeAt(d, cop) {
            var newChild = {'parent': d, 
                'name': cop.name, 'size': cop.size,
                'desc': cop.desc,
                'category': cop.category};
            if (d.children) {
                d.children.push(newChild);    
            } else {
                d.children = [newChild];
            }
            update(d);
        }

        // Toggle children on click.

        function rightClickNode(d) {
            var ev = d3.event;
            if (ev.defaultPrevented) return; // click suppressed
            if (ev.shiftKey && ev.ctrlKey) {
                deleteNode(d);
            }
            if (ev.shiftKey && !ev.ctrlKey) {
                editNode(d);
            }
            if (ev.ctrlKey && !ev.shiftKey) {
                addNewNodeAt(d);
            }
            if (!ev.shiftKey && !ev.ctrlKey) {
                d = toggleChildren(d);    
            }
            update(d);
            if (!ev.shiftKey && !ev.ctrlKey) {
                centerNode(d); 
            }
        }

        function fillEditForm(d) {
            // horrible nl form hack
            var nlf1 = nlform.fields[1];
            var nlf0 = nlform.fields[0];
            var nlf2 = nlform.fields[2];
            var nlf3 = nlform.fields[3];
            nlf0.getinput.value = d.category;
            nlf1.getinput.value = d.size;
            nlf2.getinput.value = d.name;
            nlf3.getinput.value = d.desc;
            nlf0.toggle.innerHTML = d.category.trim() !== '' ? d.category : nlf0.getinput.getAttribute('placeholder');
            nlf1.toggle.innerHTML = d.size ? d.size : nlf1.getinput.getAttribute('placeholder');
            nlf2.toggle.innerHTML = d.name.trim() !== '' ? d.name : nlf2.getinput.getAttribute('placeholder');
            nlf3.toggle.innerHTML = d.desc.trim() !== '' ? d.desc : nlf3.getinput.getAttribute('placeholder');
        }

        function editNode(d) {
            $('.main').show();
            $('.d3').hide()
            fillEditForm(d);
            selectedMode = "editing";
        }

        $(function() {
            $.contextMenu({
                selector: '.context-menu-one', 
                callback: function(key, options) {
                    if (key === "edit") {
                        editNode(hoverNode);
                    }
                    if (key === "cut") {
                        copiedNode = hoverNode;
                        deleteNode(hoverNode);
                        update(hoverNode);
                    }
                    if (key === "copy") {
                        copiedNode = hoverNode;
                    }
                    if (copiedNode && (key === "paste")) {
                        pasteNodeAt(hoverNode, copiedNode);
                    }
                    if (key === "delete") {
                        deleteNode(hoverNode);
                        update(hoverNode);
                    }
                },
                items: {
                    "sep1": "---------",
                    "edit": {name: "Edit", icon: "edit"},
                    "cut": {name: "Cut", icon: "cut"},
                    "copy": {name: "Copy", icon: "copy"},
                    "paste": {name: "Paste", icon: "paste"},
                    "delete": {name: "Delete", icon: "delete"},
                    "sep2": "---------",
                    "quit": {name: "Quit", icon: function(){
                        return 'context-menu-icon context-menu-icon-quit';
                    }}
                }
            });   
        });

        $('#submitBtn').on('click', function() {
            if (hoverNode && (selectedMode === "editing")) {
                var nlf1 = nlform.fields[1];
                var nlf0 = nlform.fields[0];
                var nlf2 = nlform.fields[2];
                var nlf3 = nlform.fields[3];
                hoverNode.name = nlf2.getinput.value;
                hoverNode.size = nlf1.getinput.value;
                hoverNode.category = nlf0.getinput.value;
                hoverNode.desc = nlf3.getinput.value;
                $('.main').hide();
                $('.d3').show();
            }
            update(root);
            return false;
        });

        $('#dlBtn').on('click', function() {
            var pom = document.createElement('a');
            pom.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(stringify(root)));
            pom.setAttribute('download', 'data.json');
            pom.click();
            return false;
        });

        function stringify(node) {
            var a = '{"name": "'+node.name+'", "category": "'+node.category+'", "desc": "'+node.desc+'", "size": '+node.size;
            if (node.children) {
                a += ', "children": [';
                var i =0;
                for (i=0; i<node.children.length; i++) {
                    a += stringify(node.children[i]);
                    a +=', ';
                }
                a = a.slice(0, -2);
                a += ']}';
            } else {
                a += '}';
            }
            return a;
        }

        function getItemLabel(d) {
            if (d.name.length > 0 && d.category.length > 0) {
                return d.category + " | " + d.name;
            }
            if (d.category.length > 0) {
                return d.category;
            }
            if (d.name.length > 0) {
                return d.name;
            }
            return "Unnamed";
        }

        function update(source) {
            // Compute the new height, function counts total children of root node and sets tree height accordingly.
            // This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
            // This makes the layout more consistent.
            var levelWidth = [1];
            var childCount = function(level, n) {

                if (n.children && n.children.length > 0) {
                    if (levelWidth.length <= level + 1) levelWidth.push(0);

                    levelWidth[level + 1] += n.children.length;
                    n.children.forEach(function(d) {
                        childCount(level + 1, d);
                    });
                }
            };
            childCount(0, root);
            var newHeight = d3.max(levelWidth) * 25; // 25 pixels per line  
            tree = tree.size([newHeight, viewerWidth]);

            // Compute the new tree layout.
            var nodes = tree.nodes(root).reverse(),
                links = tree.links(nodes);

            // Set widths between levels based on maxLabelLength.
            nodes.forEach(function(d) {
                d.y = (d.depth * (maxLabelLength * 10)); //maxLabelLength * 10px
                // alternatively to keep a fixed scale one can set a fixed depth per level
                // Normalize for fixed-depth by commenting out below line
                // d.y = (d.depth * 500); //500px per level.
            });

            // Update the nodes…
            node = svgGroup.selectAll("g.node")
                .data(nodes, function(d) {
                    return d.id || (d.id = ++i);
                });

            // Enter any new nodes at the parent's previous position.
            var nodeEnter = node.enter().append("g")
                .call(dragListener)
                .attr("class", "node")
                .attr("transform", function(d) {
                    return "translate(" + source.y0 + "," + source.x0 + ")";
                })
                .on('click', rightClickNode);

            nodeEnter.append("circle")
                .attr('class', 'nodeCircle context-menu-one')
                .attr("r", function(d) {
                    return (d.size ? d.size*2 : 5);
                })
                .style("stroke-width", function(d) {
                    return d._children ? "3px" : "1.3px";
                })
                .on("mouseover", function(d) {
                    hoverNode = d;
                });

            nodeEnter.append("text")
                .attr("x", function(d) {
                    return d.children || d._children ? -10 : 10;
                })
                .attr("dy", ".35em")
                .attr('class', 'nodeText')
                .attr("text-anchor", function(d) {
                    return d.children || d._children ? "end" : "start";
                })
                .text(getItemLabel)
                .style("fill-opacity", 0);

            

            // phantom node to give us mouseover in a radius around it
            nodeEnter.append("circle")
                .attr('class', 'ghostCircle')
                .attr("r", 30)
                .attr("opacity", 0.2) // change this to zero to hide the target area
                .style("fill", "red")
                .attr('pointer-events', 'mouseover')
                .on("mouseover", function(node) {
                    overCircle(node);
                })
                .on("mouseout", function(node) {
                    outCircle(node);
                });

            // Update the text to reflect whether node has children or not.
            node.select('text')
                .attr("x", function(d) {
                    return d.children || d._children ? -10 : 10;
                })
                .attr("text-anchor", function(d) {
                    return d.children || d._children ? "end" : "start";
                })
                .text(getItemLabel);

            // Change the circle fill depending on whether it has children and is collapsed
            node.select("circle.nodeCircle")
                .style("stroke-width", function(d) {
                    return d._children ? "3px" : "1.3px";
                })
                .attr("r", function(d) {
                    return (d.size ? d.size*2 : 5);
                });

            // Transition nodes to their new position.
            var nodeUpdate = node.transition()
                .duration(duration)
                .attr("transform", function(d) {
                    return "translate(" + d.y + "," + d.x + ")";
                });

            // Fade the text in
            nodeUpdate.select("text")
                .style("fill-opacity", 1);

            // Transition exiting nodes to the parent's new position.
            var nodeExit = node.exit().transition()
                .duration(duration)
                .attr("transform", function(d) {
                    return "translate(" + source.y + "," + source.x + ")";
                })
                .remove();

            nodeExit.select("circle")
                .attr("r", 0);

            nodeExit.select("text")
                .style("fill-opacity", 0);

            // Update the links…
            var link = svgGroup.selectAll("path.link")
                .data(links, function(d) {
                    return d.target.id;
                });

            // Enter any new links at the parent's previous position.
            link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", function(d) {
                    var o = {
                        x: source.x0,
                        y: source.y0
                    };
                    return diagonal({
                        source: o,
                        target: o
                    });
                });

            // Transition links to their new position.
            link.transition()
                .duration(duration)
                .attr("d", diagonal);

            // Transition exiting nodes to the parent's new position.
            link.exit().transition()
                .duration(duration)
                .attr("d", function(d) {
                    var o = {
                        x: source.x,
                        y: source.y
                    };
                    return diagonal({
                        source: o,
                        target: o
                    });
                })
                .remove();

            // Stash the old positions for transition.
            nodes.forEach(function(d) {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        }

        // Append a group which holds all nodes and which the zoom Listener can act upon.
        var svgGroup = baseSvg.append("g");

        // Define the root
        root = treeData;
        root.x0 = viewerHeight / 2;
        root.y0 = 0;

        // Layout the tree initially and center on the root node.
        update(root);
        centerNode(root);
    });
}

$( document ).ready(function() {
    var nlform = new NLForm( document.getElementById( 'nl-form' ) );
    $('.main').hide();
    initD3Tree(nlform);
    $('#ulBtn').on('click', function() {
        input = $('#fileInput');
        if (!input) {
          alert("Um, couldn't find the fileinput element.");
        }
        else if (!input.get(0).files) {
          alert("This browser doesn't seem to support the `files` property of file inputs. Please use latest version of Chrome");
        }
        else if (!input.get(0).files[0]) {
          alert("Please select a model before clicking 'Use upload model'");               
        }
        else {
          file = input.get(0).files[0];
          fr = new FileReader();
          fr.onload = function(e) {  
            bfile = e.target.result
            initD3Tree(nlform, JSON.parse(bfile));
          }
          fr.readAsText(file);
        }
        return false;
    })
});