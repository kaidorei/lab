/*globals energy2d, $, ACTUAL_ROOT */
/*jslint indent: 2, browser: true */
//
// lab/controllers/energy2d/controllers.js
//

// define namespace
energy2d.namespace('energy2d.controllers');

// Basic Energy2D controller.
//
// Call this constructor function with interactive definition and the ID of the DOM container for an application.
// This HTML element is used as a default container for all interactive components that don't define their own containers.
energy2d.controllers.makeInteractiveController = function (interactive, interactive_container_id, description_container_id) {
  'use strict';
  var
    // Dependencies:
    modeler_ns = energy2d.modeler,
    views_ns = energy2d.views,
    performance_ns = energy2d.utils.performance,
    // end.

    // Object with public API.
    controller,
    // Energy2D model.
    modeler,
    model_options,
    // Parameters.
    use_WebGL,
    steps_per_frame = 4,

    // TODO: refactor views support, probably using events and more general approach.
    // Required views.
    energy2d_scene,
    heatmap_view,
    velocity_view,
    parts_view,
    photons_view,
    time_view,
    simulation_player_view,
    simulation_description_view,

    // Performance tools and view.
    // By default mock tools.
    performance_tools = {
      start: function () {},
      stop: function () {},
      startFPS: function () {},
      updateFPS: function () {},
      stopFPS: function () {}
    },
    performance_view,

    // All attached HTML elements.
    $html_elements,

    interval_id,

    //
    // Private methods.
    //
    actualRootPath = function (url) {
      if (typeof ACTUAL_ROOT === "undefined" || url.charAt(0) !== "/") {
        return url;
      }
      return ACTUAL_ROOT + url;
    },

    createEnergy2DScene = function (component_def) {
      energy2d_scene = views_ns.makeEnergy2DScene(component_def.id, use_WebGL);
      heatmap_view = energy2d_scene.getHeatmapView();
      velocity_view = energy2d_scene.getVelocityView();
      parts_view = energy2d_scene.getPartsView();
      photons_view = energy2d_scene.getPhotonsView();
      time_view = energy2d_scene.getTimeView();

      return energy2d_scene;
    },

    createSimulationPlayer = function (component_def) {
      simulation_player_view = views_ns.makeSimulationPlayerView(component_def.id);
      // Bind itself (public API).
      simulation_player_view.bindSimulationController(controller);

      return simulation_player_view;
    },

    createPerformanceView = function (component_def) {
      performance_view = views_ns.makePerformanceView(component_def.id);

      return performance_view;
    },

    createSimulationDescription = function (component_def) {
      simulation_description_view = views_ns.makeSimulationDescription(component_def);
      // Bind itself (public API).
      simulation_description_view.bindSimulationController(controller);

      return simulation_description_view;
    },

    createComponent = function (component_def) {
      if (!component_def.type) {
        throw new Error('Interactive controller: missing component "type" property.');
      }
      switch (component_def.type) {
      case 'energy2d-scene-view':
        return createEnergy2DScene(component_def);
      case 'energy2d-simulation-player':
        return createSimulationPlayer(component_def);
      case 'energy2d-performance-view':
        return createPerformanceView(component_def);
      default:
        throw new Error('Interactive controller: unknow type of component.');
      }
    },

    updateDynamicViews = function () {
      heatmap_view.renderHeatmap();
      velocity_view.renderVectormap();
      photons_view.renderPhotons();
      time_view.renderTime(modeler.getTime());

      if (performance_view) {
        performance_view.update();
      }
    },

    nextStep = function () {
      var i, len;
      performance_tools.stop('Gap between frames');
      performance_tools.start('Frame (inc. ' + steps_per_frame + ' model steps)');
      for (i = 0, len = steps_per_frame; i < len; i += 1) {
        modeler.nextStep();
      }
      // Uncomment to enable velocity visualization:
      // modeler.updateVelocityArrays();

      performance_tools.start('Views update');
      // Update views (only part view is not updated, as it's static).
      updateDynamicViews();
      performance_tools.stop('Views update');

      performance_tools.stop('Frame (inc. ' + steps_per_frame + ' model steps)');
      performance_tools.start('Gap between frames');

      performance_tools.updateFPS('Model update and rendering');
    },

    createModeler = function () {
      modeler = modeler_ns.makeModeler(model_options.model);
      use_WebGL = modeler.isWebGLActive();
    },

    createViewComponents = function () {
      var
        components = interactive.components || [],
        description = interactive.description || {},
        layout = interactive.layout || {},
        component, component_layout, $html_element,
        i, len;

      $html_elements = [];
      // Load standard view components.
      for (i = 0, len = components.length; i < len; i += 1) {
        component = createComponent(components[i]);

        // Get jQuery object with DOM element.
        $html_element = component.getHTMLElement();
        // Apply style if layout contains CSS definition.
        component_layout = layout[components[i].id] || {};
        if (component_layout.css) {
          $html_element.css(component_layout.css);
        }
        if (component_layout.class) {
          $html_element.addClass(component_layout.class);
        }
        // Append to container (interactive container is a default choice).
        if (component_layout.container) {
          $html_element.appendTo(component_layout.container);
        } else {
          $html_element.appendTo(interactive_container_id);
        }
        // Add HTML element to the list.
        $html_elements.push($html_element);
      }
      // Add description.
      if (description) {
        component = createSimulationDescription(description);
        $html_element = component.getHTMLElement();
        $html_element.appendTo(description_container_id);
        // Add HTML element to the list.
        $html_elements.push($html_element);
      }
    },

    removeViewComponents = function () {
      var i, len;
      // Remove components.
      for (i = 0, len = $html_elements.length; i < len; i += 1) {
        $html_elements[i].remove();
      }
      // Reset list.
      $html_elements = [];
    },

    setupViewComponents = function () {
      var grid_x, grid_y;

      grid_x = modeler.getGridWidth();
      grid_y = modeler.getGridHeight();
      velocity_view.bindVectormap(modeler.getUVelocityArray(), modeler.getVVelocityArray(), grid_x, grid_y, 4);
      parts_view.bindPartsArray(modeler.getPartsArray(), modeler.getWidth(), modeler.getHeight());
      photons_view.bindPhotonsArray(modeler.getPhotonsArray(), modeler.getWidth(), modeler.getHeight());

      if (use_WebGL) {
        heatmap_view.bindHeatmapTexture(modeler.getTemperatureTexture());
      } else {
        heatmap_view.bindHeatmap(modeler.getTemperatureArray(), grid_x, grid_y);
      }

      // Bind performance tools model.
      if (performance_view) {
        performance_tools = performance_ns.makePerformanceTools();
        performance_view.bindModel(performance_tools);
        modeler.setPerformanceTools(performance_tools);
      }

      updateDynamicViews();
      parts_view.renderParts();
    },

    loadInteractive = function () {
      // Download model options (located at interactive.model attribute).
      $.get(actualRootPath(interactive.model))
        .success(function (data) {
          // When they are ready, save them, create modeler, load components and setup them.
          if (typeof data === "string") {
            data = JSON.parse(data);
          }
          model_options = data;

          createModeler();
          createViewComponents();
          setupViewComponents();
        })
        .error(function (jqXHR, textStatus, errorThrown) {
          throw new Error("Interactive controller: loading scene options failed - " + textStatus);
        });
    };

  //
  // Public API
  //
  controller = {
    // Overwrite WebGL optimization option.
    setWebGLEnabled: function (b) {
      controller.simulationStop();
      model_options.model.use_WebGL = b;
      createModeler();
      removeViewComponents();
      createViewComponents();
      setupViewComponents();
    },

    //
    // Simulation controller methods implementation.
    //
    simulationPlay: function () {
      if (!interval_id) {
        interval_id = setInterval(nextStep, 0);
        performance_tools.start('Gap between frames');
        performance_tools.startFPS('Model update and rendering');
      }
    },

    simulationStep: function () {
      if (!interval_id) {
        performance_tools.start('Gap between frames');
        nextStep();
        performance_tools.stop('Gap between frames');
      }
    },

    simulationStop: function () {
      if (interval_id !== undefined) {
        performance_tools.stop('Gap between frames');
        performance_tools.stopFPS('Model update and rendering');
        clearInterval(interval_id);
        interval_id = undefined;
      }
    },

    simulationReset: function () {
      controller.simulationStop();
      // TODO: use modeler.reset()
      createModeler();
      setupViewComponents();
    }
  };

  // One-off initialization.
  loadInteractive();

  return controller;
};
