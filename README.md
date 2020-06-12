# TileXYZLayerFor4326
通过mapbox的customLayer实现的叠加4326底图

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
			url:"https://t2.tianditu.gov.cn/vec_c/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=c&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=你的token"
		});

		tileLayer.addTo(map);

	});
</script>
</html>
```
