# TileXYZLayerFor4326
mapbox叠加4326底图

```
<!DOCTYPE html>
<html>
<head>
	<title></title>
	<link rel="stylesheet" type="text/css" href="./mapbox-gl.css">
	<style type="text/css">
		*{
			margin: 0;
			padding: 0;
			list-style: none;
		}
		html,body,#map{
			width: 100%;
			height: 100%;
			overflow: hidden;
		}
	</style>
	<script type="text/javascript" src="./mapbox-gl-dev.js"></script>
	<script type="text/javascript" src="./TileXYZLayerFor4326.js"></script>
</head>
<body>
  <div id="map" ></div>
</body>
<script type="text/javascript">
	var map = new mapboxgl.Map({
	  container: 'map',
	  center: [121.2348223143415, 30.832582604356205],
	  zoom: 8.481175774418286,
	  fadeDuration:0,
	  style: {
		"version":8,
		"name":"Positron",
		"metadata":{},
		"glyphs":"fonts/{fontstack}/{range}.pbf",
		"sources":{},
		"layers":[]
	},
	hash: false,
	  
	});
	map.on('load', function() {

		var tileLayer = new TileXYZLayerFor4326({
			//url:"http://192.168.60.81:8080/EzServer7/Maps/linewell/EzMap?Service=getImage&Type=RGB&ZoomOffset=0&Col={y}&Row={x}&Zoom={z}&V=1.0.0",
			url:"https://t2.tianditu.gov.cn/vec_c/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=c&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=755a7d8636035a8308201503309c944f"
		});

		tileLayer.addTo(map);

	});
</script>
</html>
```
