define([
  "esri/layers/FeatureLayer",
  "esri/widgets/Editor",
  "esri/widgets/ElevationProfile",
  "esri/widgets/Expand",
  "esri/symbols/PathSymbol3DLayer",
  "esri/symbols/PointSymbol3D",
  "esri/symbols/ObjectSymbol3DLayer",
  "esri/layers/support/LabelClass",
  "esri/geometry/support/webMercatorUtils",
  "esri/geometry/SpatialReference",
  "esri/geometry/projection",
  "esri/geometry/geometryEngine",
], function (
  FeatureLayer,
  Editor,
  ElevationProfile,
  Expand,
  PathSymbol3DLayer,
  PointSymbol3D,
  ObjectSymbol3DLayer,
  LabelClass,
  webMercatorUtils,
  SpatialReference,
  projection,
  geometryEngine
) {
  // Helper for 3D line symbol
  function createLine3DSymbol(
    color = [255, 0, 0, 0.7],
    width = 25,
    height = 4
  ) {
    return {
      type: "line-3d",
      symbolLayers: [
        new PathSymbol3DLayer({
          profile: "quad",
          material: { color },
          width,
          height,
          profileRotation: "heading",
          cap: "round",
          join: "round",
          anchor: "bottom",
        }),
      ],
    };
  }

  // Helper for 3D tower symbol
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
        expression: `Text($feature.Stru_ID) + " RiskIndex = " + Text(Round($feature.meanVal, 2))`,
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

  // Place this helper function near the top of your setupScene function or outside if you prefer
  async function getMeanForTower(
    towerGeom,
    hexbinLayer,
    geometryEngine,
    projection
  ) {
    // Query hexbin features
    const hexbinFeatures = await hexbinLayer
      .queryFeatures()
      .then((res) => res.features);

    // Project towerGeom to hexbin's spatial reference (28355)
    let projectedTowerGeom = towerGeom;
    const hexbinSR = hexbinFeatures[0]?.geometry?.spatialReference;
    if (towerGeom.spatialReference?.wkid !== hexbinSR?.wkid) {
      await projection.load();
      projectedTowerGeom = projection.project(towerGeom, hexbinSR);
    }

    for (const hexbin of hexbinFeatures) {
      if (geometryEngine.intersects(projectedTowerGeom, hexbin.geometry)) {
        return hexbin.attributes.MEAN;
      }
    }
    return 999; // Default value if no intersection found
  }

  let startLength = 0;

  // Helper to initialize prevTrackCost with the current total cost

  async function calculateAndUpdateTrackCost(cTracksLayer, sTracksLayer) {
    let totalLength = 0;
    const cost = 9.7; // EXW it should be 0.97, just to emphatize the cost per meter
    const clientResult = await cTracksLayer.queryFeatures({
      returnGeometry: false,
      outFields: ["Shape__Length"],
    });

    clientResult.features.forEach((f) => {
      if (f.attributes) {
        totalLength += parseFloat(f.attributes.Shape__Length);
      }
    });

    if (!sTracksLayer) {
      startLength = totalLength;
    } else {
      const suggestedResult = await sTracksLayer.queryFeatures({
        returnGeometry: false,
        outFields: ["Shape__Length"],
      });

      suggestedResult.features.forEach((f) => {
        if (f.attributes) {
          totalLength += parseFloat(f.attributes.Shape__Length);
        }
      });
    }
    const prevTrackCost = Math.round(startLength * cost);
    const newTrackCost = Math.round(totalLength * cost);
    const costChange = newTrackCost - prevTrackCost;
    const diffAbs = Math.abs(costChange).toLocaleString();
    console.log(prevTrackCost, newTrackCost, costChange, diffAbs);
    let arrow = "";
    let color = "";
    if (costChange < 0) {
      arrow = "▼";
      color = "green";
    } else if (costChange > 0) {
      arrow = "▲";
      color = "red";
    }

    // Update Stat 2
    const stat2 = document.getElementById("stat2");
    if (stat2) {
      let diffHtml = "";
      if (costChange !== 0) {
        diffHtml = ` <span style="color:${color};font-weight:bold;">${arrow} ${diffAbs}$</span>`;
      }
      stat2.innerHTML = `Cost for Suggested Tracks: <b>${newTrackCost.toLocaleString()}$</b>${diffHtml}`;
    }
  }

  function renderElevationStats(stats) {
    if (!stats) return "";
    // Unicode up/down arrows for clarity
    return `
      <b>Max Slope:</b>
      <span style="color:#007acc;">&#8593; ${
        stats.maxPositiveSlope?.toFixed(1) ?? "-"
      }°</span>
      <span style="color:#d9534f;">&#8595; ${
        stats.maxNegativeSlope?.toFixed(1) ?? "-"
      }°</span>
      &nbsp;|&nbsp;
      <b>Avg Slope:</b>
      <span style="color:#007acc;">&#8593; ${
        stats.avgPositiveSlope?.toFixed(1) ?? "-"
      }°</span>
      <span style="color:#d9534f;">&#8595; ${
        stats.avgNegativeSlope?.toFixed(1) ?? "-"
      }°</span>
    `;
  }

  function updateRiskIndexStat(meanVal, oldMeanVal) {
    const stat0 = document.getElementById("stat0");
    const riskArrow = document.getElementById("riskArrow");
    if (stat0 && riskArrow) {
      const diff = meanVal - oldMeanVal;
      const diffAbs = Math.abs(diff).toFixed(2);
      let arrow = "";
      let color = "";
      if (diff > 0) {
        arrow = "▲";
        color = "red";
      } else if (diff < 0) {
        arrow = "▼";
        color = "green";
      } else {
        arrow = "";
        color = "";
      }
      // Arrow on the left of the number
      stat0.innerHTML = `RiskIndex Δ: <span style="color:${color};font-weight:bold;">${arrow}</span> ${diffAbs}`;
      riskArrow.innerHTML = "";
      const stat3 = document.getElementById("stat3");
      if (stat3) {
        stat3.innerHTML = `Safe Distance from Water Body <span style="color:green;font-weight:bold;">✔</span>`;
      }
    }
  }

  return function setupScene(view, scene) {
    // Title
    const titleDiv = document.getElementById("titleDiv");
    if (titleDiv && scene.portalItem?.title) {
      titleDiv.innerText = scene.portalItem.title;
    }

    const elevationProfile = new ElevationProfile({
      view,
      profiles: [{ type: "ground", title: "Ground profile" }],
      visibleElements: { selectButton: true },
    });

    view.ui.add(
      new Expand({
        view,
        content: elevationProfile,
        expanded: true,
        expandIconClass: "esri-icon-chart",
        group: "bottom",
      }),
      "bottom-left"
    );

    // Watch the viewModel state
    elevationProfile.viewModel.watch("state", (state) => {
      if (state === "selected") {
        const profile = elevationProfile.viewModel.profiles.items[0];
        if (profile) {
          profile.watch("statistics", (newStats) => {
            if (newStats) {
              // Update Stat 4
              const stat4 = document.getElementById("stat4");
              if (stat4) {
                stat4.innerHTML = renderElevationStats(newStats);
              }
            }
          });
        }
      }
    });
    // Tree Layer
    const treeRenderer = {
      type: "simple",
      symbol: {
        type: "web-style",
        styleName: "EsriLowPolyVegetationStyle",
        name: "Populus",
      },
      label: "generic tree",
      visualVariables: [
        {
          type: "size",
          axis: "height",
          field: "TreeHeight",
          valueUnit: "meters",
        },
      ],
    };
    let treeLayer = scene.layers.find(
      (layer) => layer.title && layer.title.includes("Tree Points")
    );
    treeLayer.renderer = treeRenderer;

    // Road Segments Layer
    const roadSegmentsLayer = scene.layers.find(
      (layer) => layer.title && layer.title.includes("Road Segments")
    );
    if (roadSegmentsLayer) {
      roadSegmentsLayer.elevationInfo = {
        mode: "relative-to-ground",
        offset: 5,
      };
      roadSegmentsLayer.renderer = {
        type: "simple",
        symbol: createLine3DSymbol([0, 0, 0, 0.7], 5, 2), // black
      };
    }

    // Access Tracks Layer
    const accessTracksLayer = scene.layers.find(
      (layer) => layer.title && layer.title.includes("GeoEasyTracks (m)")
    );
    let clientTracksLayer;
    if (accessTracksLayer) {
      accessTracksLayer.elevationInfo = {
        mode: "relative-to-ground",
        offset: 5,
      };
      accessTracksLayer.renderer = {
        type: "simple",
        symbol: createLine3DSymbol([120, 120, 120, 0.7]), // lighter grey
      };
      accessTracksLayer.queryFeatures().then((results) => {
        const clientTrackFeatures = results.features.map((feature, i) => ({
          geometry: feature.geometry,
          attributes: {
            OBJECTID: i + 1,
            ...feature.attributes,
          },
        }));
        const trackFields = [
          { name: "OBJECTID", type: "oid", Shape__Length: "double" },
        ];
        const sampleAttrs = results.features[0]?.attributes || {};
        Object.keys(sampleAttrs).forEach((key) => {
          if (key !== "OBJECTID" && !trackFields.find((f) => f.name === key)) {
            trackFields.push({ name: key, type: "string" });
          }
        });
        clientTracksLayer = new FeatureLayer({
          title: "Proposed Access Tracks",
          source: clientTrackFeatures,
          objectIdField: "OBJECTID",
          geometryType: "polyline",
          fields: trackFields,
          renderer: accessTracksLayer.renderer,
          elevationInfo: accessTracksLayer.elevationInfo,
          editingEnabled: true,
          spatialReference: accessTracksLayer.spatialReference,
          templates: [
            {
              name: "New Proposed Tracks", // This will show in the Editor widget
              description: "Create a new access track",
              prototype: {
                attributes: {},
              },
            },
          ],
        });
        scene.add(clientTracksLayer);
        accessTracksLayer.visible = false;
        // add a line here when clientTracksLayer is ready show the total length of all tracks
        clientTracksLayer.when(() => {
          calculateAndUpdateTrackCost(clientTracksLayer);
        });
      });
    }

    // Suggested Tracks Layer
    const suggestedTracksLayer = new FeatureLayer({
      title: "Suggested Track",
      source: [],
      objectIdField: "OBJECTID",
      geometryType: "polyline",
      fields: [
        { name: "OBJECTID", type: "oid" },
        { name: "Shape__Length", type: "double" },
      ],
      elevationInfo: {
        mode: "relative-to-ground",
        offset: 5,
      },
      editingEnabled: true,
      spatialReference: {
        latestWkid: 28355,
        wkid: 28355,
      },
      templates: [
        {
          name: "New Suggested Tracks", // This will show in the Editor widget
          description: "Create a new suggested access track",
          prototype: {
            attributes: {},
          },
        },
      ],
      renderer: {
        type: "simple",
        symbol: createLine3DSymbol([144, 238, 144, 0.7]), // light green
      },
    });
    scene.add(suggestedTracksLayer);

    // Towers and Tracks logic
    view.whenLayerView(suggestedTracksLayer).then(() => {
      scene.when(() => {
        // Tower Layer
        const towerLayer = scene.layers.find(
          (layer) =>
            layer.title && layer.title.includes("Tower with Risk Scores")
        );
        if (!towerLayer) {
          console.warn("Tower layer not found.");
          return;
        }
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-right",
        };

        // Find the hexbin layer
        const hexbinLayer = scene.layers.find(
          (layer) =>
            layer.title && layer.title.includes("Hexbin (With Attributes)")
        );

        towerLayer.when(() => {
          let labelClass = createTowerLabelClass();
          let deletedTrackInfos = [];
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

            // Editor for towers
            const editor = new Editor({
              view: view,
            });
            view.ui.add(editor, "top-left");

            editor.viewModel.watch("state", (state) => {
              if (state === "editing-attributes") {
                const ffvm = editor.viewModel.featureFormViewModel;
                if (ffvm && ffvm.feature) {
                  const feature = ffvm.feature;
                  let geometryHandle = feature.watch(
                    "geometry",
                    (newGeometry) => {
                      if (newGeometry) {
                        // --- Tree hiding logic ---

                        const query = treeLayer.createQuery();
                        query.geometry = newGeometry;
                        query.distance = 100;
                        query.units = "meters";
                        query.spatialRelationship = "intersects";
                        query.returnGeometry = true;
                        treeLayer.queryFeatures(query).then((result) => {
                          const treeOIDsToHide = result.features.map(
                            (f) => f.attributes.OID
                          );

                          // Update tree filter as before
                          view.whenLayerView(treeLayer).then((layerView) => {
                            if (treeOIDsToHide.length > 0) {
                              layerView.filter = {
                                where: `OID NOT IN (${treeOIDsToHide.join(
                                  ","
                                )})`,
                              };
                            } else {
                              layerView.filter = null;
                            }

                            // Update Stat 1: Displaced Tree count, icon, and carbon emission reduction
                            const stat1 = document.getElementById("stat1");
                            if (stat1) {
                              // Example SVG icon (replace 'tree.svg' with your own file if needed)
                              const treeIcon = `<img src="tree-flower-super-mario-fire-flower.png" alt="tree" style="height:1em;vertical-align:middle;margin-right:4px;">`;
                              // Estimate: 21.77 kg CO₂/year per tree (typical for a mature tree)
                              const co2PerTree = 21.77;
                              // EXW - setting the scenario of on average we displace 10 trees per tower, if this tower displace 3 then we got 7 extra
                              const totalCO2 = (
                                10 -
                                treeOIDsToHide.length * co2PerTree
                              ).toFixed(1);

                              stat1.innerHTML = `${treeIcon} Displaced Trees: <b>${treeOIDsToHide.length}</b> &nbsp; | &nbsp; <span style="color:green;">Estimated CO₂ reduction: <b>${totalCO2}</b> kg/year</span>`;
                            }
                          });
                        });

                        // --- Polyline update logic ---
                        const clientTracksLayer = scene.layers.find(
                          (layer) =>
                            layer.title &&
                            layer.title.includes("Proposed Access Tracks")
                        );

                        if (clientTracksLayer) {
                          const polylineQuery = clientTracksLayer.createQuery();
                          polylineQuery.geometry = newGeometry;
                          polylineQuery.distance = 100;
                          polylineQuery.units = "meters";
                          polylineQuery.spatialRelationship = "intersects";
                          polylineQuery.returnGeometry = true;
                          polylineQuery.outFields = ["*"];
                          clientTracksLayer
                            .queryFeatures(polylineQuery)
                            .then((result) => {
                              const intersectingPolylines = result.features;
                              intersectingPolylines.forEach((polyFeature) => {
                                const paths = polyFeature.geometry.paths[0];
                                let startPoint = paths[0];
                                let endPoint = [
                                  ffvm.feature.geometry.longitude,
                                  ffvm.feature.geometry.latitude,
                                ];
                                let startPointWGS84 = startPoint;
                                if (
                                  polyFeature.geometry.spatialReference
                                    ?.wkid !== 4326
                                ) {
                                  const pt = {
                                    type: "point",
                                    x: startPoint[0],
                                    y: startPoint[1],
                                    spatialReference: { wkid: 3857 },
                                  };
                                  const pt4326 =
                                    webMercatorUtils.webMercatorToGeographic(
                                      pt
                                    );
                                  startPointWGS84 = [pt4326.x, pt4326.y];
                                }
                                if (
                                  !deletedTrackInfos
                                    .map((e) => e.attributes.OBJECTID)
                                    .includes(polyFeature.attributes.OBJECTID)
                                ) {
                                  deletedTrackInfos.push({
                                    startPoint: [...startPointWGS84],
                                    towerId: feature.attributes.Stru_ID,
                                    endPoint: [...endPoint],
                                    attributes: { ...polyFeature.attributes },
                                  });
                                  clientTracksLayer.applyEdits({
                                    deleteFeatures: [polyFeature],
                                  });
                                } else {
                                }
                              });
                            });
                        }
                      }
                    }
                  );
                }
              } else if (
                state === "editing-existing-feature"
                // ||
                // state === "awaiting-feature-to-update"
              ) {
                if (deletedTrackInfos.length > 0) {
                  deletedTrackInfos.forEach((trackInfo, idx) => {
                    const trackTowerId = trackInfo.towerId;
                    clientTowerLayer
                      .queryFeatures({
                        where: `Stru_ID = '${trackTowerId}'`,
                        returnGeometry: true,
                        outFields: ["OBJECTID", "Stru_ID", "meanVal"],
                      })
                      .then(async (towerResults) => {
                        if (towerResults.features.length > 0) {
                          const towerGeometry =
                            towerResults.features[0].geometry;
                          const objectId =
                            towerResults.features[0].attributes.OBJECTID; // <-- get the correct OBJECTID

                          const meanVal = await getMeanForTower(
                            towerGeometry,
                            hexbinLayer,
                            geometryEngine,
                            projection
                          );
                          updateRiskIndexStat(
                            meanVal,
                            towerResults.features[0].attributes.meanVal
                          );
                          clientTowerLayer
                            .applyEdits({
                              updateFeatures: [
                                {
                                  attributes: {
                                    OBJECTID: objectId,
                                    Stru_ID: trackTowerId,
                                    meanVal: meanVal,
                                  },
                                },
                              ],
                            })
                            .then((result) => {});
                          // Logic to create suggested track
                          const start = trackInfo.startPoint;
                          const attributes = trackInfo.attributes;
                          let end;
                          if (towerGeometry.spatialReference?.wkid !== 4326) {
                            await projection.load();
                            const pt4326 = projection.project(
                              towerGeometry,
                              new SpatialReference({ wkid: 4326 })
                            );
                            end = [pt4326.x, pt4326.y];
                          } else {
                            end = [
                              towerGeometry.longitude,
                              towerGeometry.latitude,
                            ];
                          }
                          const polyline = {
                            type: "polyline",
                            paths: [[start, end]],
                          };

                          suggestedTracksLayer.applyEdits({
                            addFeatures: [
                              {
                                geometry: polyline,
                                attributes: {
                                  ...attributes,
                                  OBJECTID:
                                    attributes.OBJECTID ||
                                    suggestedTracksLayer.source.length + 1,
                                },
                              },
                            ],
                          });
                        }
                      });
                  });
                  calculateAndUpdateTrackCost(
                    clientTracksLayer,
                    suggestedTracksLayer
                  );
                }
              }
            });

            editor.viewModel.on("sketch-update", (event) => {
              // You can add custom logic here if needed
            });
          });
        });
      });
    });
  };
});
