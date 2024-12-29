const fireworks_compute_shader = /* wgsl */ `

const PI = 3.14159265358979;

struct Uniforms {
  model_matrix: mat4x4f,
  delta_t: f32,
  time: f32,
  frame: f32,
  particles_per_fireworks: f32,
  max_ttl: f32,
};


struct Particle {
  position: vec4f,
  velocity: vec4f,
  acceleration: vec4f,
  ttl: f32,
}

struct Fireworks {
  center: vec4f,
  ttl_offset: f32,
  reset: f32,
  random: vec2f,
  color: vec4f,
}


@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> particle_buffer: array<Particle>;
@group(0) @binding(2) var<storage, read> fireworks_buffer: array<Fireworks>;


fn rand(co: vec2f) -> f32 {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}


@compute @workgroup_size(64)
fn compute(@builtin(global_invocation_id) globalId: vec3u) {
  let particle_index = globalId.x;
  if (particle_index >= arrayLength(&particle_buffer)) {
      return;
  }

  let particle: Particle = particle_buffer[particle_index];
  let fireworks: Fireworks = fireworks_buffer[particle_index / u32(uniforms.particles_per_fireworks)];

  if (fireworks.reset == 1) {
    let randX = rand(fireworks.random + vec2f(f32(particle_index), 0.0));
    let randY = rand(fireworks.random + vec2f(f32(particle_index), 100.0));
    let lat = acos(2 * randX - 1);
    let lng = randY * 2 * PI;
    let xAccel = sin(lat) * cos(lng);
    let yAccel = cos(lat);
    let zAccel = sin(lat) * sin(lng);

    let speed = 0.2;

    particle_buffer[particle_index].acceleration = vec4f(xAccel, yAccel, zAccel, 0) * speed;
    particle_buffer[particle_index].velocity = vec4(0);
    particle_buffer[particle_index].position = vec4f(0);
    particle_buffer[particle_index].ttl = 100 * rand(fireworks.random + vec2f(f32(particle_index), 50.0));
  }
  
  if (fireworks.ttl_offset <= 0) {
    return;
  }

  const friction = 0.999;

  let friction_factor = 1.0 - (1.0-friction) * uniforms.delta_t;

  var acceleration = particle.acceleration;
  var velocity = particle.velocity + acceleration / uniforms.delta_t;
  velocity *= friction_factor;
  var position = (particle.position + velocity / uniforms.delta_t);
  let ttl = particle_buffer[particle_index].ttl;
  
  particle_buffer[particle_index].acceleration = vec4f(0); // reset acceleration
  particle_buffer[particle_index].velocity = velocity;
  particle_buffer[particle_index].ttl = ttl + 1;
  particle_buffer[particle_index].position = position;
}

`
