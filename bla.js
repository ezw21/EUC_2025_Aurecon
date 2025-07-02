require([
	"esri/layers/SceneLayer",
	"esri/views/SceneView",
	"esri/Map",
	"esri/renderers/UniqueValueRenderer",
	"esri/symbols/MeshSymbol3D",
	"esri/symbols/PolygonSymbol3D",
	"esri/symbols/FillSymbol3DLayer",
	"esri/Color",
	"esri/core/promiseUtils",
	"esri/layers/GraphicsLayer",
	"esri/geometry/Mesh",
	"esri/geometry/support/MeshMaterialMetallicRoughness",
	"esri/geometry/support/MeshComponent",
	"esri/geometry/Polygon",
	"esri/geometry/geometryEngine",
	"esri/Graphic",
	"esri/layers/FeatureLayer",
	"esri/widgets/Daylight",
	"esri/geometry/SpatialReference"
], function (
	SceneLayer,
	SceneView,
	Map,
	UniqueValueRenderer,
	MeshSymbol3D,
	PolygonSymbol3D,
	FillSymbol3DLayer,
	Color,
	promiseUtils,
	GraphicsLayer,
	Mesh,
	MeshMaterialMetallicRoughness,
	MeshComponent,
	Polygon,
	geometryEngine,
	Graphic,
	FeatureLayer,
	Daylight,
	SpatialReference
) {
	const wallColor = new Color("#00fffb");

	const buildings = new SceneLayer({
		popupEnabled: false,
		url:
			"https://services.arcgis.com/V6ZHFr6zdgNZuVG0/ArcGIS/rest/services/SF_BLDG_WSL1/SceneServer/layers/0"
	});

	const footprints = new FeatureLayer({
		url:
			"https://services.arcgis.com/V6ZHFr6zdgNZuVG0/ArcGIS/rest/services/SF_BLDG_WSL1/FeatureServer/0"
	});

	const walls = new GraphicsLayer({
		elevationInfo: {
			mode: "absolute-height"
		}
	});

	const view = new SceneView({
		container: "viewDiv",

		map: new Map({
			basemap: "satellite",
			ground: "world-elevation",
			layers: [buildings, walls]
		}),

		qualityProfile: "high",
		environment: {
			lighting: {
				directShadowsEnabled: true
			}
		},

		camera: {
			position: {
				longitude: -122.38429652,
				latitude: 37.78940182,
				z: 466.37978
			},
			heading: 274.36,
			tilt: 54.29
		}
	});

	const daylight = new Daylight({ view });

	view.ui.add(daylight, "top-right");

	function getCageGraphic(wall, opacity, height) {
		const geometry = new Polygon({
			rings: [wall.rings[0].map((coords) => [...coords, height])],
			spatialReference: SpatialReference.WebMercator
		});
		return new Graphic({
			geometry: geometry,
			symbol: new PolygonSymbol3D({
				symbolLayers: [
					new FillSymbol3DLayer({
						outline: {
							size: 1.5,
							color: [153, 255, 253, opacity]
						},
						material: {
							color: [0, 0, 0, 0]
						}
					})
				]
			})
		});
	}

	async function animateFootprint(building, extent, popmotion) {
		const objectId = building.getObjectId();

		const query = footprints.createQuery();
		query.objectIds = [objectId];
		query.outFields = ["*"];
		query.multipatchOption = "xyFootprint";
		query.returnGeometry = true;

		const result = await footprints.queryFeatures(query);
		if (result.features.length === 0) {
			return;
		}

		const footprint = result.features[0];

		const hull = geometryEngine.convexHull(footprint.geometry, true);
		const buffer = geometryEngine.buffer(hull, 10, "meters");
		const wall = geometryEngine.generalize(buffer, 10, true, "meters");
		const size = (extent.zmax - extent.zmin) * 0.9;

		walls.removeAll();

		function createWall(s) {
			const mesh = createMesh(wall, extent.zmin, size * s);
			walls.removeAll();

			const fill = new FillSymbol3DLayer({
				material: {
					color: wallColor,
					colorMixMode: "tint"
				},
				castShadows: false
			});

			walls.addMany([
				getCageGraphic(wall, 1, (extent.zmin + 0.5) * s),
				getCageGraphic(wall, 0.2, (extent.zmin + size / 2) * s),
				getCageGraphic(wall, 0.6, (extent.zmin + size / 4) * s),
				getCageGraphic(wall, 0.8, (extent.zmin + size / 8) * s)
			]);

			walls.add(
				new Graphic({
					geometry: mesh,
					symbol: new MeshSymbol3D({
						symbolLayers: [fill]
					})
				})
			);
		}

		return new Promise((resolve) => {
			popmotion.animate({
				type: "spring",
				from: 0,
				velocity: 0,
				to: 1,
				stiffness: 200,
				onUpdate: createWall,
				onComplete: resolve
				// mass: 1,
				// damping: 10
			});
		});
	}

	function createMesh(polygon, zmin, height = 100) {
		const ring = polygon.rings[0];
		const triangles = [];
		const vertices = [];
		const colors = [];

		for (let i = 0; i < ring.length; i++) {
			const vIdx0 = 2 * i;
			const vIdx1 = 2 * i + 1;

			const vIdx2 = (2 * i + 2) % (2 * ring.length);
			const vIdx3 = (2 * i + 3) % (2 * ring.length);

			// Add new wall vertex
			vertices.push(ring[i][0], ring[i][1], zmin);
			vertices.push(ring[i][0], ring[i][1], height);

			// Colors
			colors.push(255, 255, 255, 255);
			colors.push(255, 255, 255, 0);

			triangles.push(vIdx0, vIdx1, vIdx2, vIdx2, vIdx1, vIdx3);
		}

		const wall = new MeshComponent({
			faces: triangles,
			shading: "flat",
			material: new MeshMaterialMetallicRoughness({
				emissiveColor: wallColor,
				metallic: 0.5,
				roughness: 0.8,
				doubleSided: true
			})
		});

		return new Mesh({
			components: [wall],
			vertexAttributes: {
				position: vertices,
				color: colors
			},
			spatialReference: polygon.spatialReference
		});
	}
	view.when(async () => {
		const buildingsLV = await view.whenLayerView(buildings);

		view.on(
			"click",
			promiseUtils.debounce(async (e) => {
				const ht = await view.hitTest(e, {
					include: [buildings]
				});

				walls.removeAll();

				for (const result of ht.results) {
					const graphic = result.graphic;
					if (graphic && graphic.layer === buildings) {
						const extentResult = await buildingsLV.queryExtent({
							objectIds: [graphic.getObjectId()],
							returnGeometry: true
						});

						await animateFootprint(graphic, extentResult.extent, popmotion);

						return;
					}
				}
			})
		);
	});
});
