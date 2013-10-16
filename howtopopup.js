var popup = make_popup();

function make_popup() {
    var url = "http://localhost:8000/child.html";
    var width = 1200;
    var height = 800;
    var left = parseInt((screen.availWidth/2) - (width/2)); // Horizontal middle
    var top = parseInt((screen.availHeight/2) - (height/2)); // Vertical middle
    var windowFeatures = "width=" + width + ",height=" + height +   
        ",status,resizable,left=" + left + ",top=" + top + 
        "screenX=" + left + ",screenY=" + top + ",scrollbars=yes";

    return window.open(url, "subWind", windowFeatures, "POS");
}


function closePopup(p) {
	if (p && !p.closed) {
	    p.close();
	}
}