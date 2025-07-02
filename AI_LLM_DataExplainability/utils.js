define([
  "esri/symbols/PointSymbol3D",
  "esri/symbols/ObjectSymbol3DLayer",
  "esri/layers/FeatureLayer",
  "esri/layers/support/LabelClass",
  "esri/Color",
  "esri/geometry/Polygon",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/symbols/PolygonSymbol3D",
  "esri/symbols/FillSymbol3DLayer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/SpatialReference",
  "esri/geometry/Mesh",
  "esri/geometry/support/MeshMaterialMetallicRoughness",
  "esri/geometry/support/MeshComponent",
  "esri/core/reactiveUtils",
  "esri/symbols/MeshSymbol3D",
], function (
  PointSymbol3D,
  ObjectSymbol3DLayer,
  FeatureLayer,
  LabelClass,
  Color,
  Polygon,
  geometryEngine,
  Graphic,
  PolygonSymbol3D,
  FillSymbol3DLayer,
  GraphicsLayer,
  SpatialReference,
  Mesh,
  MeshMaterialMetallicRoughness,
  MeshComponent,
  reactiveUtils,
  MeshSymbol3D
) {
  /**
   * Sets up the Humelink 3D Tower renderer and LayerList for the given scene/view.
   * Uses the GitHub model URL to avoid local file CORS issues.
   * @param {__esri.SceneView} view
   * @param {__esri.WebScene} scene
   */
  function setupPopupAI(view, scene) {
    // Helper for 3D tower symbol using the GitHub URL
    function createTowerSymbol(
      modelUrl = "https://ezw21.github.io/EUC_2025_Aurecon/models/transmission_tower.glb",
      height = 70
    ) {
      return new PointSymbol3D({
        symbolLayers: [
          new ObjectSymbol3DLayer({
            resource: { href: modelUrl },
            height,
            anchor: "bottom",
          }),
        ],
      });
    }

    // Helper for 3D label class (Arcade expression for meanVal)
    function createTowerLabelClass() {
      return new LabelClass({
        labelExpressionInfo: {
          expression: `Text($feature.Stru_ID)`,
        },
        symbol: {
          type: "label-3d",
          symbolLayers: [
            {
              type: "text",
              material: { color: "black" },
              size: 12,
              background: { color: "white" },
              halo: { color: "white", size: 1 },
              font: { family: "sans-serif", weight: "bold" },
            },
          ],
          verticalOffset: {
            screenLength: 40,
            maxWorldLength: 500,
            minWorldLength: 20,
          },
          callout: { type: "line", color: "gray", size: 1 },
        },
      });
    }

    // Wall effect helpers
    const wallColor = new Color("#00fffb");
    const walls = new GraphicsLayer({
      elevationInfo: { mode: "absolute-height" },
    });
    view.map.add(walls);

    function getCageGraphic(wall, opacity, height) {
      const geometry = new Polygon({
        rings: [wall.rings[0].map((coords) => [...coords, height])],
        spatialReference: SpatialReference.WebMercator,
      });
      console.log(geometry.spatialReference)
      return new Graphic({
        geometry: geometry,
        symbol: new PolygonSymbol3D({
          symbolLayers: [
            new FillSymbol3DLayer({
              outline: {
                size: 1.5,
                color: [153, 255, 253, opacity],
              },
              material: {
                color: [0, 0, 0, 0],
              },
            }),
          ],
        }),
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
          doubleSided: true,
        }),
      });

      return new Mesh({
        components: [wall],
        vertexAttributes: {
          position: vertices,
          color: colors,
        },
        spatialReference: polygon.spatialReference,
      });
    }

    // Animate wall effect for a selected feature
    async function animateFootprint(feature, extent, onUpdate, onComplete) {
      const hull = geometryEngine.convexHull(feature.geometry, true);
      const buffer = geometryEngine.buffer(hull, 10, "meters");
      const wall = geometryEngine.generalize(buffer, 10, true, "meters");
      const size = (extent.zmax - extent.zmin) * 0.9;

      let s = 0;
      const steps = 20;
      const interval = 12; // ms per frame

      function drawStep() {
        s += 1 / steps;
        if (s > 1) s = 1;
        walls.removeAll();

        const mesh = createMesh(wall, extent.zmin, size * s);
        const fill = new FillSymbol3DLayer({
          material: {
            color: wallColor,
            colorMixMode: "tint",
          },
          castShadows: false,
        });

        walls.addMany([
          getCageGraphic(wall, 1, (extent.zmin + 0.5) * s),
          getCageGraphic(wall, 0.2, (extent.zmin + size / 2) * s),
          getCageGraphic(wall, 0.6, (extent.zmin + size / 4) * s),
          getCageGraphic(wall, 0.8, (extent.zmin + size / 8) * s),
          new Graphic({
            geometry: mesh,
            symbol: new MeshSymbol3D({
              symbolLayers: [fill],
            }),
          }),
        ]);
        if (onUpdate) onUpdate(s);
        if (s < 1) {
          setTimeout(drawStep, interval);
        } else if (onComplete) {
          onComplete();
        }
      }
      console.log("Animating footprint for feature:", feature.attributes.OBJECTID);
      drawStep();
    }

    // Wait for the scene to load layers, then set up the client-side tower layer
    scene.when(() => {
      scene.environment = {
        lighting: {
          directShadowsEnabled: true,
        },
      };
      scene.highlightOptions = {
        fillOpacity: 0.1,
        shadowColor: new Color("cyan"),
        shadowOpacity: 0.3,
      };
      // Find and hide the original Humelink 3D Towers layer
      let towerLayer = scene.layers.find(
        (layer) => layer.title && layer.title.includes("Humelink 3D Towers")
      );
      if (!towerLayer)
        console.warn("Original Humelink 3D Towers layer not found");

      towerLayer.when(() => {
        const labelClass = createTowerLabelClass();
        const towerSymbol = createTowerSymbol();
        towerLayer.queryFeatures().then(async (results) => {
          // Build clientTowerFeatures with resolved meanVal values
          const clientTowerFeatures = await Promise.all(
            results.features.map(async (feature, i) => ({
              geometry: feature.geometry,
              attributes: {
                OBJECTID: i + 1,
                Stru_ID: feature.attributes.Stru_ID,
                meanVal: feature.attributes.meanVal || 999, // Default value if not set
              },
            }))
          );
          const clientTowerLayer = new FeatureLayer({
            title: "Proposed Towers",
            source: clientTowerFeatures,
            objectIdField: "OBJECTID",
            geometryType: "point",
            fields: [
              { name: "OBJECTID", type: "oid" },
              { name: "Stru_ID", type: "string" },
              { name: "meanVal", type: "double" },
            ],
            renderer: { type: "simple", symbol: towerSymbol },
            labelingInfo: [labelClass],
            elevationInfo: { mode: "on-the-ground" },
            editingEnabled: true,
            templates: [
              {
                name: "New Tower", // This will show in the Editor widget
                description: "Create a new tower",
                prototype: {
                  attributes: {},
                },
              },
            ],
          });

          scene.add(clientTowerLayer);
          towerLayer.visible = false;

          // Animate wall effect when popup selected feature changes
          reactiveUtils.watch(
            () => view.popup.selectedFeature,
            async function (feature) {
              walls.removeAll();
              if (feature && feature.geometry) {
                console.log("Selected feature for animation:", feature);
                const extent = await clientTowerLayer.queryExtent({
                  objectIds: [feature.attributes.OBJECTID],
                  returnGeometry: true,
                });
                animateFootprint(feature, extent.extent);
              }
            }
          );
        });
      });
    });
  }

  return {
    setupPopupAI,
  };
});
