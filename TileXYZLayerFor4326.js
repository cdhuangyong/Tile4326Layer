window.TileXYZLayerFor4326 = (function(){

	function clamp(value,min,max){
		return value < min ? min : value > max ? max: value
	}

	var caches = {
		data:{},
		get:function(key){
			return this.data[key];
		},
		put:function(key,value){
			this.data[key] = value;
		},
		clear:function(){
			this.data = {};
		}
	};

	var lib = mapboxgl;
	
	var transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

	var transparentImage = (function(){
		var canvas = document.createElement("canvas");
		canvas.width = 256;
		canvas.height = 256;
		var context = canvas.getContext("2d");
		context.fillStyle = "rgba(0,0,0,0)";  
		context.fillRect(0,0,256,256); 
		return canvas;
	})();

	var vetexShaderSource = `
		uniform mat4 u_Matrix;
		uniform vec4 u_Translate;
		attribute vec3 a_Position;
		attribute vec2 a_UV;
		varying vec2 v_UV;
		void main(){
			v_UV = a_UV;
			gl_Position = u_Matrix * vec4( (a_Position.xy + u_Translate.xy), 0.0 ,1.0 );
		}
	`;

	var fragmentShaderSource = `
		#ifdef GL_ES
			precision mediump float;
		#endif
		varying vec2 v_UV;
		uniform sampler2D texture;
		void main(){
			vec4 textureColor = texture2D(texture,v_UV);
			gl_FragColor = textureColor;
		}
	`;

	function TileXYZLayerFor4326(options){

		this._options = Object.assign({
			minzoom:3,
			maxzoom:22,
			tileSize:256
		},options);

		this._extent = this._options.extent || [-180,-90,180,90];

		this._map = null;
		this._transform = null;
		this._program = null;
		this._gl = null;

		//当前可视区域的切片
		this._tiles = {};

	}

	TileXYZLayerFor4326.prototype = {

		constructor:TileXYZLayerFor4326,

		addTo:function(map){

			this._map = map;
			this._transform = map.transform;
			this._layerId = "vectorTileLayer_"+Date.now();

			map.addLayer({
				id:this._layerId,
				type: 'custom',
				onAdd: (function(_this){
					return function(map,gl){
						return _this._onAdd(map,gl,this);
					}
				})(this),
				render: (function(_this){
					return function(gl, matrix){
						return _this._render(gl, matrix, this);
					}
				})(this)
			});

			map.on("remove",function(){
				caches.clear();
			});
		},

		_onAdd: function(map,gl){
			var _this = this;

			this._gl = gl;

			this.transparentTexture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.transparentTexture);
			gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transparentImage);
			gl.bindTexture(gl.TEXTURE_2D,null);

			var vetexShader = gl.createShader(gl.VERTEX_SHADER)
			gl.shaderSource(vetexShader,vetexShaderSource);
			gl.compileShader(vetexShader);

			if (!gl.getShaderParameter(vetexShader,gl.COMPILE_STATUS)) {
				throw "Shader Compile Error: " + (gl.getShaderInfoLog(vetexShader));
			}

			var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
			gl.shaderSource(fragmentShader,fragmentShaderSource);
			gl.compileShader(fragmentShader);

			if (!gl.getShaderParameter(fragmentShader,gl.COMPILE_STATUS)) {
				throw "Shader Compile Error: " + (gl.getShaderInfoLog(fragmentShader));
			}

			var program = this._program = gl.createProgram();
			gl.attachShader(program, vetexShader);
			gl.attachShader(program, fragmentShader);
			gl.linkProgram(program);
			/**
			 * 属性
			 */
			var attributes = this._attributes = {
				aPosition:{
					name:"a_Position",
					location:gl.getAttribLocation(this._program,"a_Position"),
				},
				aUV:{
					name:"a_UV",
					location:gl.getAttribLocation(this._program,"a_UV"),
				}
			};

			/**
			 * 缓冲区
			 */
			this._buffers = {
				aPositionBuffer:{
					buffer:gl.createBuffer(),
					size:3,
					attribute: attributes["aPosition"],
					points: new Float32Array(3 * 6),
					update:function(extent){
					},
					update1:function(extent){
						gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
						var centerMecatorExtent = extent;
						var minx = centerMecatorExtent[0],
							miny = centerMecatorExtent[1],
							maxx = centerMecatorExtent[2],
							maxy = centerMecatorExtent[3];
						var points = this.points;
						points[0] = minx ,points[1] = maxy, points[2] = 0.0 , 
						points[3] = maxx ,points[4] = maxy, points[5] = 0.0,  
						points[6] = minx ,points[7] = miny, points[8] = 0.0  ,
						points[9] = maxx ,points[10] = maxy, points[11] = 0.0 , 
						points[12] = minx,points[13] = miny, points[14] = 0.0,  
						points[15] = maxx,points[16] = miny, points[17] = 0.0 ; 
						gl.bufferData(gl.ARRAY_BUFFER,points, gl.STATIC_DRAW);
						gl.enableVertexAttribArray(this.attribute.location);
						gl.vertexAttribPointer(this.attribute.location,this.size,gl.FLOAT,false,0,0);
					}
				},
				aUVBuffer:{
					buffer:gl.createBuffer(),
					size:2,
					attribute:attributes["aUV"],
					points:new Float32Array( [0,0,1,0,0,1,1,0,0,1,1,1] ),
					hasBufferData:false,
					update:function(){
						gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
						if(!this.hasBufferData){
							gl.bufferData(gl.ARRAY_BUFFER, this.points, gl.STATIC_DRAW);
							this.hasBufferData = true;
						}
						gl.enableVertexAttribArray(this.attribute.location);
						gl.vertexAttribPointer(this.attribute.location,this.size,gl.FLOAT,false,0,0);
					}
				}
			}
			/**
			 * 变量
			 */
			this._uniforms = {
				uMatrix:{
					value:null,
					location:gl.getUniformLocation(this._program,"u_Matrix"),
					update:function(matrix){
						if(this.value !== matrix){
							gl.uniformMatrix4fv(this.location,false,matrix);
						}
					}
				},
				uTranslate:{
					value:[0,0],
					location:gl.getUniformLocation(this._program,"u_Translate"),
					update:function(){}
				},
				uTexture:{
					value:null,
					location:gl.getUniformLocation(this._program, 'texture'),
					update:function(){}
				}
			};
		},
		/**
		 * 渲染
		 * @param {*} gl 
		 * @param {*} matrix 
		 */
		_render:function(gl, matrix){
			if(this._program){
				
				var transform = this._transform;
				var options = this._options;
				var tileSize = options.tileSize ||256;

				var z  =  transform.coveringZoomLevel({
					tileSize:tileSize,
					roundZoom:true
				});
				
				this.realz = z;

				z = z < 5 ? 5 : z;

				this.z = z;

				if (options.minzoom !== undefined && z < options.minzoom) { z = 0; }

				if (options.maxzoom !== undefined && z > options.maxzoom) { z = options.maxzoom; }
	
				var resolution =  this.resolution = this.getResolutionFromZ(z);

				var center = transform.center;

				//var centerCoord = lib.MercatorCoordinate.fromLngLat(transform.center);
				var maxx = clamp (center.lng + resolution * tileSize, -180, 180);
				var miny = clamp (center.lat - resolution * tileSize, -90, 90);
				var minx = clamp (center.lng, -180, 180) ,maxy = clamp(center.lat, -90,90) ;
				var leftBottom = lib.MercatorCoordinate.fromLngLat([minx,miny]);
				var topRight = lib.MercatorCoordinate.fromLngLat([maxx,maxy]);

				this.centerMecatorExtent = [leftBottom.x,leftBottom.y,topRight.x,topRight.y];

				gl.useProgram(this._program);

				gl.enable(gl.BLEND);

				gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);


				for(let key in this._uniforms){
					this._uniforms[key].update(matrix);
				}

				for(let key in this._buffers){
					this._buffers[key].update();
				}

				this.calcTilesInView();

				this.renderTiles();
				
			}
		},
		renderTiles(){
			var gl = this._gl;
			var tiles = this._tiles;
			var tile;

			for(var key in tiles){

				tile = tiles[key];

				tile.calcExtent();

				this._buffers.aPositionBuffer.update1(tile.extent);

				gl.uniform4fv(this._uniforms.uTranslate.location,tile.translate);
				gl.activeTexture(gl.TEXTURE0);
				if(tile.texture){
					gl.bindTexture(gl.TEXTURE_2D, tile.texture);
				}else{
					gl.bindTexture(gl.TEXTURE_2D, this.transparentTexture);
				}
				gl.uniform1i(this._uniforms.uTexture.location, 0);
				gl.drawArrays(gl.TRIANGLES, 0, 6);	
			}

		},
		/**
		 * 计算当前可视范围内的切片
		 */
		calcTilesInView:function(){
			var z = this.z;
			var options = this._options;
			var tileSize = options.tileSize ||256;

			var resolution = this.resolution;
	
			var extent = this._extent;
			var tileRes = resolution * tileSize;
			var viewExtent = this.getViewExtent();

			var startX =  Math.floor((viewExtent[0] - extent[0]) / tileRes);
			var startY =  Math.floor((extent[3] - viewExtent[3]) / tileRes);
			var endX   =  Math.ceil((viewExtent[2] - extent[0]) / tileRes);
			var endY   =  Math.ceil((extent[3] - viewExtent[1]) / tileRes);
			
			// startX = startX < 20 ? 20 : startX;
			startY = startY < 1 ?  1 : startY;
			// endX = endX < 31 ? 31 : endX;
			//endY = endY < 20 ? 20 : endY;
			if(this.realz < 5){
				endY = endY > 10 ? 10 : endY
			}
			

			var i,j,key,tile;

			var tiles = this._tiles;

			var newTiles = {}

			for(i = startX ; i <  endX; i ++){
				for(j = startY; j < endY ; j ++){
					key = this._key(z,i,j);
					if(!tiles[key]){
						caches.get(key);
						if(caches.get(key)){
							newTiles[key] = caches.get(key);
						}else{
							tile = new Tile(z,i,j,resolution,this);
							newTiles[key] = tile;
						}
					}else{
						newTiles[key] = tiles[key];
						delete tiles[key];
					}
				}
			};
			
			for(var key in tiles){
				if(tiles[key].request){
					tiles[key].request.cancel();
				}
			}

			this._tiles = newTiles;
			
		},
		_key:function(z,x,y){
			return z+'/'+x+"/"+y;
		},
		/**
		 * 计算分辨率
		 */
		getResolutionFromZ:function(z){
			return 1.4062500000000002 / Math.pow(2,z);
		},
		/**
		 * 计算extent
		 */
		getViewExtent:function(){
			var transform = this._transform;
			var bounds = [
				transform.pointLocation(new lib.Point(0, 0)),
				transform.pointLocation(new lib.Point(transform.width, 0)),
				transform.pointLocation(new lib.Point(transform.width, transform.height)),
				transform.pointLocation(new lib.Point(0, transform.height))				
			];

			var minx , miny , maxx, maxy;

			for(var i = 0,pont = null ; i < bounds.length ; i ++ ){
				point = bounds[i];
				if(i ==  0 ){
					minx = point.lng;
					miny = point.lat;
					maxx = point.lng;
					maxy = point.lat;
				}else {
					if(minx > point.lng) minx = point.lng;
					if(miny > point.lat) miny = point.lat;
					if(maxx < point.lng) maxx = point.lng;
					if(maxy < point.lat) maxy = point.lat;
				}
			}

			return [
				clamp(minx,-180,180),
				clamp(miny,-90,90),
				clamp(maxx,-180,180),
				clamp(maxy,-90,90)
			]
		},
		/**
		 * 重绘
		 */
		repaint:function(){
			this._map.triggerRepaint();
		}

	}

		/**
	 * 请求
	 * @param {*} url 
	 * @param {*} callback 
	 * @param {*} async 
	 */
	var getImage = (function(){

		var MAX_REQUEST_NUM = 16;

		var requestNum = 0;
		var requestQuenes = [];

		function getImage(url,callback){
			if(requestNum > MAX_REQUEST_NUM){
				var quene = {	
					url:url,
					callback:callback,
					canceled:false,
					cancel:function(){
						this.canceled = true;
					}
				}
				requestQuenes.push(quene);
				return quene;
			}

			var advanced = false;
			var advanceImageRequestQueue = function () {
				if (advanced) { return; }
				advanced = true;
				requestNum--;
				while (requestQuenes.length && requestNum < MAX_REQUEST_NUM) { // eslint-disable-line
					var request = requestQuenes.shift();
					var url = request.url;
					var callback = request.callback;
					var canceled = request.canceled;
					if (!canceled) {
						request.cancel = getImage(url, callback).cancel;
					}
				}
			};

			requestNum ++ ;	
			var req = get(url,function(error,data){
				advanceImageRequestQueue();
				if(!error){
					var URL = window.URL || window.webkitURL;
					var blob = new Blob([data],{type:"image/png"});
					var blobUrl = URL.createObjectURL(blob)
					var image = new Image();
					image.src = blobUrl;
					image.onload = function(){
						callback(image);
						URL.revokeObjectURL(image.src);
					};
					image.src = data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
				}

			});

			return {
				cancel:function(){
					req.abort();
				}
			}
		}

		function get(url, callback, async) {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', url, async === false ? false : true);
			xhr.responseType = "arraybuffer";
			xhr.onabort = function (event) {
				callback(true, null);
			};
			xhr.onload = function (event) {
				if (!xhr.status || xhr.status >= 200 && xhr.status < 300) {
					var source;
					source = xhr.response;
					if (source) {
						try {
							source = eval("(" + source + ")");
						} catch (e) {
						}
					}
					if (source) {
						callback(false, source);
					} else {
						callback(false, null);
					}
				}
			};
			xhr.onerror = function (e) {
				callback(true, null);
			};
			xhr.send(null);
			return xhr;
		}

		return getImage;
	})()



	function Tile(z,x,y,resolution,layer){
		this._resolution = resolution;
		this._layer = layer;
		this._coord = [z,x,y];
		this._gl = layer._gl;
		this._url = layer._options.url;
		this.texture = null;
		this.loaded = false;
		this.tileSize = layer._options.tileSize;
		this.worldExtent = layer._extent;
		this.extent = [0,0,0,0];
		this.translate = [0,0,0,0];
		this._load();
	}

	Tile.prototype = {
		constructor:Tile,

		calcExtent:function(){
			
			var gl = this._gl;
			var worldExtent = this.worldExtent;
			var tileSize = this.tileSize;
			var resolution = this._resolution;
			var coord = this._coord;
			var x = coord[1],y = coord[2];

			var maxTileNum = Math.ceil((worldExtent[3] - worldExtent[1]) / resolution / tileSize);

			var minx = clamp(x * tileSize * resolution - worldExtent[2],-180,180);
			var maxx = clamp(minx + tileSize * resolution, -180,180);
			var maxy = clamp(worldExtent[3] - y * tileSize * resolution, -90 , 90 );
			var miny = clamp(maxy - tileSize * resolution, -90,90);

			var y1 = y + 1;
			y1 = y1 > maxTileNum ? maxTileNum : y1;
			maxy1 = worldExtent[3] - y1 * tileSize * resolution;


			var bl = lib.MercatorCoordinate.fromLngLat([minx,miny]);
			var tr = lib.MercatorCoordinate.fromLngLat([maxx,maxy]);

			this.extent[0] = bl.x;
			this.extent[1] = bl.y;
			this.extent[2] = tr.x;
			this.extent[3] = tr.y;

			//var centerMecatorExtent = this._layer.centerMecatorExtent;

			// if(!this.translate){
			// 	this.translate = [0,0,0,0];
			// }

			// this.translate[0] = bl.x - centerMecatorExtent[0];
			// this.translate[1] = bl.y - centerMecatorExtent[1];
			// this.translate[2] = tr.x - centerMecatorExtent[2];
			// this.translate[3] = tr.y - centerMecatorExtent[3];

		},
		_load: function(){
			var gl = this._gl
			var _this = this;
			var z = this._coord[0];
			var x = this._coord[1];
			var y = this._coord[2];
			var url = this._url.replace("{x}",x).replace("{y}",y).replace("{z}",z);

			this.request = getImage(url,function(img){
				delete _this .request;
				if(_this._gl){
					var texture = _this.texture = gl.createTexture();
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
					gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
					gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
					gl.bindTexture(gl.TEXTURE_2D, null);
					caches.put(z+"/"+x+"/"+y,_this);
					this.loaded = true;
					_this._layer.repaint();
				}
			});
		}
	}


	return TileXYZLayerFor4326

})()