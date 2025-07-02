define([
  "esri/symbols/PointSymbol3D",
  "esri/symbols/ObjectSymbol3DLayer",
  "esri/layers/FeatureLayer",
    "esri/layers/support/LabelClass",
], function (PointSymbol3D, ObjectSymbol3DLayer, FeatureLayer, LabelClass) {
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

    // Wait for the scene to load layers, then set up the client-side tower layer
    scene.when(() => {
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
        });
      });
      //   Create a client-side FeatureLayer for the 3D towers
    });
  }

  return {
    setupPopupAI,
  };
});
