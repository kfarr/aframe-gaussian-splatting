/* global AFRAME, Ammo, THREE */
/* eslint-disable new-cap, no-inner-declarations */
/* inspired from https://rawcdn.githack.com/kripken/ammo.js/8f8b7187ef74994093318645e5e96b11d982688a/examples/webgl_demo_vehicle/index.html */

function injectJS(url) {
    const link = document.createElement("script");
    link.src = url;
    link.id = "injectedAmmoJS";
    const promise = new Promise(function (resolve, reject) {
      link.addEventListener("load", () => resolve(link));
      link.addEventListener("error", (e) => reject(e));
    });
    document.head.appendChild(link);
    return promise;
  }
  
  AFRAME.registerComponent("vehicle-controls", {
    schema: {},
    init() {
      // Keyboard actions
      this.actions = {};
      this.keysActions = {
        KeyW: "acceleration",
        KeyS: "braking",
        KeyA: "left",
        KeyD: "right",
      };
  
      this.ammoLoaded = false;
      this.vehiculePhysicsInitialized = false;
      this.modelLoaded = !!this.el.getObject3D("mesh");
      this.keydown = this.keydown.bind(this);
      this.keyup = this.keyup.bind(this);
      // when used with webpack
      //(async () => {
      //  const module = await import("../lib/ammo.wasm.js");
      //  module.default().then((Ammo) => {
      //    global.Ammo = Ammo;
      //    this.ammoLoaded = true;
      //    this.update();
      //  });
      //})();
      // when used on glitch
      (async () => {
        await injectJS("https://cdn.jsdelivr.net/gh/kripken/ammo.js@8f8b7187ef74994093318645e5e96b11d982688a/builds/ammo.wasm.js");
        Ammo().then((Ammo) => {
          this.ammoLoaded = true;
          this.update();
        });
      })();
      
      const dracoLoader = this.el.sceneEl.systems["gltf-model"].getDRACOLoader();
      this.loader = new THREE.GLTFLoader();
      if (dracoLoader) {
        this.loader.setDRACOLoader(dracoLoader);
      }
      const wheelUrl = "https://cdn.jsdelivr.net/gh/pmndrs/racing-game@7816a5d954b75e6ad853ae4e4f0cbbd628072643/public/models/wheel-draco.glb";
      this.loader.load(
        wheelUrl,
        (gltfModel) => {
          this.wheelModel = gltfModel.scene || gltfModel.scenes[0];
          this.wheelModel = this.wheelModel.getObjectByName("wheel");
          this.update();
        },
        undefined,
        function gltfFailed(error) {
          console.error(error, wheelUrl);
        }
      );
    },
    events: {
      "model-loaded": function (evt) {
        this.modelLoaded = true;
        // this.el.object3D.traverse((node) => {
        //   if (node.material) {
        //     node.material.needsUpdate = true
        //   }
        // });
        this.update();
      },
    },
    initVehiculePhysics() {
      // - Global variables -
      this.DISABLE_DEACTIVATION = 4;
      this.TRANSFORM_AUX = new Ammo.btTransform();
      this.ZERO_QUATERNION = new THREE.Quaternion(0, 0, 0, 1);
  
      // speedometer
      this.speedometer = document.createElement("div");
      this.speedometer.id = "speedometer";
      this.speedometer.innerText = "0.0 km/h";
      this.speedometer.setAttribute(
        "style",
        "color: #ffffff; background-color: #990000; position: absolute; bottom: 0px; right: 0px; padding: 5px;"
      );
      document.body.appendChild(this.speedometer);
  
      this.materialDynamic = new THREE.MeshPhongMaterial({ color: 0xfca400 }); // wall of cubes
      this.materialStatic = new THREE.MeshPhongMaterial({ color: 0x999999 }); // floor
      this.materialInteractive = new THREE.MeshPhongMaterial({ color: 0x000000 }); // the car and wheels
  
      this.syncList = [];
  
      this.initPhysics();
      this.createObjects();
      this.vehiculePhysicsInitialized = true;
    },
  
    initPhysics() {
      // Physics configuration
      this.collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
      this.dispatcher = new Ammo.btCollisionDispatcher(
        this.collisionConfiguration
      );
      this.broadphase = new Ammo.btDbvtBroadphase();
      this.solver = new Ammo.btSequentialImpulseConstraintSolver();
      this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(
        this.dispatcher,
        this.broadphase,
        this.solver,
        this.collisionConfiguration
      );
      this.physicsWorld.setGravity(new Ammo.btVector3(0, -9.82, 0));
    },
  
    update() {
      if (!this.ammoLoaded) return;
      if (!this.modelLoaded) return;
      if (!this.wheelModel) return;
      if (!this.vehiculePhysicsInitialized) {
        this.initVehiculePhysics();
      }
    },
  
    tick(t, delta) {
      if (!this.vehiculePhysicsInitialized) return;
      const dt = delta / 1000;
      for (let i = 0; i < this.syncList.length; i++) {
        this.syncList[i](dt);
      }
      this.physicsWorld.stepSimulation(dt, 10);
    },
  
    keyup(e) {
      if (this.keysActions[e.code]) {
        this.actions[this.keysActions[e.code]] = false;
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    },
  
    keydown(e) {
      if (this.keysActions[e.code]) {
        this.actions[this.keysActions[e.code]] = true;
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    },
  
    createBox(pos, quat, w, l, h, mass, friction) {
      const material = mass > 0 ? this.materialDynamic : this.materialStatic;
      const shape = new THREE.BoxGeometry(w, l, h, 1, 1, 1);
      const geometry = new Ammo.btBoxShape(
        new Ammo.btVector3(w * 0.5, l * 0.5, h * 0.5)
      );
  
      if (!mass) mass = 0;
      if (!friction) friction = 1;
  
      const mesh = new THREE.Mesh(shape, material);
      mesh.position.copy(pos);
      mesh.quaternion.copy(quat);
      this.el.sceneEl.object3D.add(mesh);
  
      const transform = new Ammo.btTransform();
      transform.setIdentity();
      transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
      transform.setRotation(
        new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w)
      );
      const motionState = new Ammo.btDefaultMotionState(transform);
  
      const localInertia = new Ammo.btVector3(0, 0, 0);
      geometry.calculateLocalInertia(mass, localInertia);
  
      const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        mass,
        motionState,
        geometry,
        localInertia
      );
      const body = new Ammo.btRigidBody(rbInfo);
  
      body.setFriction(friction);
      // body.setRestitution(.9);
      // body.setDamping(0.2, 0.2);
  
      this.physicsWorld.addRigidBody(body);
  
      if (mass > 0) {
        body.setActivationState(this.DISABLE_DEACTIVATION);
        // Sync physics and graphics
        const sync = (dt) => {
          const ms = body.getMotionState();
          if (ms) {
            ms.getWorldTransform(this.TRANSFORM_AUX);
            const p = this.TRANSFORM_AUX.getOrigin();
            const q = this.TRANSFORM_AUX.getRotation();
            mesh.position.set(p.x(), p.y(), p.z());
            mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
          }
        };
  
        this.syncList.push(sync);
      }
      return mesh;
    },
  
    createWheelMesh(radius, width) {
      // const t = new THREE.CylinderGeometry(radius, radius, width, 24, 1);
      // t.rotateZ(Math.PI / 2);
      // const mesh = new THREE.Mesh(t, this.materialInteractive);
      // mesh.add(
      //   new THREE.Mesh(
      //     new THREE.BoxGeometry(width * 1.5, radius * 1.75, radius * 0.25, 1, 1, 1),
      //     this.materialInteractive
      //   )
      // );
      const mesh = this.wheelModel.clone(true);
      this.el.sceneEl.object3D.add(mesh);
      return mesh;
    },
  
    createChassisMesh(w, l, h) {
      // const shape = new THREE.BoxGeometry(w, l, h, 1, 1, 1);
      // const mesh = new THREE.Mesh(shape, this.materialInteractive);
      // this.el.sceneEl.object3D.add(mesh);
      // return mesh;
      return this.el.object3D;
    },
  
    createVehicle(pos, quat) {
      // Vehicle constants
      var chassisWidth = 1.8 / 4;
      var chassisHeight = .6 / 4;
      var chassisLength = 4 / 4;
      var massVehicle = 800 / 4;
  
      var wheelAxisPositionBack = -1 / 4;
      var wheelRadiusBack = .4 / 4;
      var wheelWidthBack = .3 / 4;
      var wheelHalfTrackBack = 1 / 4;
      var wheelAxisHeightBack = .3 / 4;
  
      var wheelAxisPositionFront = 1.7 / 4;
      var wheelHalfTrackFront = 1 / 4;
      var wheelAxisHeightFront = .3 / 4;
      var wheelRadiusFront = .35 / 4;
      var wheelWidthFront = .2 / 4;
  
      var friction = 1000;
      var suspensionStiffness = 20.0 / 4;
      var suspensionDamping = 2.3 / 4;
      var suspensionCompression = 4.4 / 4;
      var suspensionRestLength = 0.6 / 4;
      var rollInfluence = 0.2 / 4;
  
      var steeringIncrement = .01;
      var steeringClamp = .5;
      var maxEngineForce = 2000;
      var maxBreakingForce = 100;
  
      // Chassis
      const geometry = new Ammo.btBoxShape(
        new Ammo.btVector3(
          chassisWidth * 0.5,
          chassisHeight * 0.5,
          chassisLength * 0.5
        )
      );
      const transform = new Ammo.btTransform();
      transform.setIdentity();
      transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
      transform.setRotation(
        new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w)
      );
      const motionState = new Ammo.btDefaultMotionState(transform);
      const localInertia = new Ammo.btVector3(0, 0, 0);
      geometry.calculateLocalInertia(massVehicle, localInertia);
      const body = new Ammo.btRigidBody(
        new Ammo.btRigidBodyConstructionInfo(
          massVehicle,
          motionState,
          geometry,
          localInertia
        )
      );
      body.setActivationState(this.DISABLE_DEACTIVATION);
      this.physicsWorld.addRigidBody(body);
      const chassisMesh = this.createChassisMesh(
        chassisWidth,
        chassisHeight,
        chassisLength
      );
  
      // Raycast Vehicle
      let engineForce = 0;
      let vehicleSteering = 0;
      let breakingForce = 0;
      const tuning = new Ammo.btVehicleTuning();
      const rayCaster = new Ammo.btDefaultVehicleRaycaster(this.physicsWorld);
      const vehicle = new Ammo.btRaycastVehicle(tuning, body, rayCaster);
      vehicle.setCoordinateSystem(0, 1, 2);
      this.physicsWorld.addAction(vehicle);
  
      // Wheels
      const FRONT_LEFT = 0;
      const FRONT_RIGHT = 1;
      const BACK_LEFT = 2;
      const BACK_RIGHT = 3;
      const wheelMeshes = [];
      const wheelDirectionCS0 = new Ammo.btVector3(0, -1, 0);
      const wheelAxleCS = new Ammo.btVector3(-1, 0, 0);
  
      const addWheel = (isFront, pos, radius, width, index) => {
        const wheelInfo = vehicle.addWheel(
          pos,
          wheelDirectionCS0,
          wheelAxleCS,
          suspensionRestLength,
          radius,
          tuning,
          isFront
        );
  
        wheelInfo.set_m_suspensionStiffness(suspensionStiffness);
        wheelInfo.set_m_wheelsDampingRelaxation(suspensionDamping);
        wheelInfo.set_m_wheelsDampingCompression(suspensionCompression);
        wheelInfo.set_m_frictionSlip(friction);
        wheelInfo.set_m_rollInfluence(rollInfluence);
  
        wheelMeshes[index] = this.createWheelMesh(radius, width);
        if (index === FRONT_LEFT || index === BACK_LEFT) {
          wheelMeshes[index].scale.set(-1, 1, 1);
        }
        const s = wheelMeshes[index].scale;
        // wheelMeshes[index].scale.set(s.x * 0.8, s.y * 0.8, s.z * 0.8);
        wheelMeshes[index].scale.set(s.x * 0.8 / 4, s.y * 0.8 / 4, s.z * 0.8 / 4);
      };
  
      addWheel(
        true,
        new Ammo.btVector3(
          wheelHalfTrackFront,
          wheelAxisHeightFront,
          wheelAxisPositionFront
        ),
        wheelRadiusFront,
        wheelWidthFront,
        FRONT_LEFT
      );
      addWheel(
        true,
        new Ammo.btVector3(
          -wheelHalfTrackFront,
          wheelAxisHeightFront,
          wheelAxisPositionFront
        ),
        wheelRadiusFront,
        wheelWidthFront,
        FRONT_RIGHT
      );
      addWheel(
        false,
        new Ammo.btVector3(
          wheelHalfTrackBack,
          wheelAxisHeightBack,
          wheelAxisPositionBack
        ),
        wheelRadiusBack,
        wheelWidthBack,
        BACK_LEFT
      );
      addWheel(
        false,
        new Ammo.btVector3(
          -wheelHalfTrackBack,
          wheelAxisHeightBack,
          wheelAxisPositionBack
        ),
        wheelRadiusBack,
        wheelWidthBack,
        BACK_RIGHT
      );
  
      // Sync keyboard actions and physics and graphics
      const sync = (dt) => {
        const speed = vehicle.getCurrentSpeedKmHour();
  
        this.speedometer.innerText =
          (speed < 0 ? "(R) " : "") + Math.abs(speed).toFixed(1) + " km/h";
  
        breakingForce = 0;
        engineForce = 0;
  
        if (this.actions.acceleration) {
          if (speed < -1) breakingForce = maxBreakingForce;
          else engineForce = maxEngineForce;
        }
        if (this.actions.braking) {
          if (speed > 1) breakingForce = maxBreakingForce;
          else engineForce = -maxEngineForce / 2;
        }
        if (this.actions.left) {
          if (vehicleSteering < steeringClamp)
            vehicleSteering += steeringIncrement;
        } else {
          if (this.actions.right) {
            if (vehicleSteering > -steeringClamp)
              vehicleSteering -= steeringIncrement;
          } else {
            if (vehicleSteering < -steeringIncrement)
              vehicleSteering += steeringIncrement;
            else {
              if (vehicleSteering > steeringIncrement)
                vehicleSteering -= steeringIncrement;
              else {
                vehicleSteering = 0;
              }
            }
          }
        }
  
        vehicle.applyEngineForce(engineForce, BACK_LEFT);
        vehicle.applyEngineForce(engineForce, BACK_RIGHT);
  
        vehicle.setBrake(breakingForce / 2, FRONT_LEFT);
        vehicle.setBrake(breakingForce / 2, FRONT_RIGHT);
        vehicle.setBrake(breakingForce, BACK_LEFT);
        vehicle.setBrake(breakingForce, BACK_RIGHT);
  
        vehicle.setSteeringValue(vehicleSteering, FRONT_LEFT);
        vehicle.setSteeringValue(vehicleSteering, FRONT_RIGHT);
  
        let tm, p, q;
        const n = vehicle.getNumWheels();
        for (let i = 0; i < n; i++) {
          vehicle.updateWheelTransform(i, true);
          tm = vehicle.getWheelTransformWS(i);
          p = tm.getOrigin();
          q = tm.getRotation();
          wheelMeshes[i].position.set(p.x(), p.y(), p.z());
          wheelMeshes[i].quaternion.set(q.x(), q.y(), q.z(), q.w());
        }
  
        tm = vehicle.getChassisWorldTransform();
        p = tm.getOrigin();
        q = tm.getRotation();
        chassisMesh.position.set(p.x(), p.y(), p.z());
        chassisMesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
      };
  
      this.syncList.push(sync);
    },
  
    createObjects() {
      // floor
      // this.createBox(new THREE.Vector3(0, -0.5, 0), this.ZERO_QUATERNION, 75, 1, 75, 0, 2);
      const floor = this.createBox(
        new THREE.Vector3(0, -0.4, 0),
        this.ZERO_QUATERNION,
        500,
        1,
        500,
        0,
        2
      );
      floor.visible = false;
  
      // ramp
      // const quaternion = new THREE.Quaternion(0, 0, 0, 1);
      // quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 18);
      // const ramp = this.createBox(new THREE.Vector3(0, -1.5, 0), quaternion, 8, 4, 10, 0);
      // const ramp = this.createBox(new THREE.Vector3(-30, -1.5, -3), quaternion, 8, 4, 10, 0);
  
      // wall of cubes
      // const size = 0.75;
      // const nw = 8;
      // const nh = 6;
      // for (let j = 0; j < nw; j++) {
      //   for (let i = 0; i < nh; i++) {
      //     this.createBox(
      //       new THREE.Vector3(size * j - (size * (nw - 1)) / 2, size * i, 10),
      //       this.ZERO_QUATERNION,
      //       size,
      //       size,
      //       size,
      //       10
      //     );
      //   }
      // }
  
      // this.createVehicle(new THREE.Vector3(0, 4, -20), this.ZERO_QUATERNION);
      this.createVehicle(this.el.object3D.position, this.el.object3D.quaternion);
    },
  
    play() {
      window.addEventListener("keydown", this.keydown);
      window.addEventListener("keyup", this.keyup);
    },
  
    pause() {
      window.removeEventListener("keydown", this.keydown);
      window.removeEventListener("keyup", this.keyup);
    },
  
    remove() {
      if (this.materialDynamic) this.materialDynamic.dispose();
      if (this.materialStatic) this.materialStatic.dispose();
      if (this.materialInteractive) this.materialInteractive.dispose();
      if (this.speedometer) this.speedometer.remove();
    },
  });
  