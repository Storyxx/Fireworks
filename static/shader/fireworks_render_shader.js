const fireworks_render_shader = /* wgsl */ `



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

struct VSOutput {
  @builtin(position) position: vec4f,
  @location(0) texcoord: vec2f,
  @location(1) @interpolate(flat) index: u32,
  @location(2) screen_position: vec2f,
  @location(3) skip: f32,
  @location(4) z_distance: f32,
  @location(5) last_coords: vec2f,
  @location(6) this_coords: vec2f,
  @location(7) ttl: f32,
};


@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> particle_buffer: array<Particle>;
@group(0) @binding(2) var<storage, read> fireworks_buffer: array<Fireworks>;


const pointScale = 0.05;



@vertex
fn vertex(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) particle_index: u32,
) -> VSOutput {
  // quad
  let points = array(
    vec2f(-1, -1),
    vec2f( 1, -1),
    vec2f(-1,  1),
    vec2f(-1,  1),
    vec2f( 1, -1),
    vec2f( 1,  1),
  );

  let quad = array(
    0,
    2,
    1,
    1,
    2,
    3
  );

  var camera_position = vec3f(0, 0, 1);

  let particle: Particle = particle_buffer[particle_index];
  let fireworks: Fireworks = fireworks_buffer[particle_index / u32(uniforms.particles_per_fireworks)];

  let ttl = particle_buffer[particle_index].ttl;

  var position = uniforms.model_matrix * (particle.position + fireworks.center);
  var last_position = uniforms.model_matrix * (particle.position - particle.velocity*4 + fireworks.center);

  var screen_position = position.xy;
  var last_screen_position = last_position.xy;

  var aabb_extent = abs(screen_position - last_screen_position) + 2 * vec2f(pointScale, pointScale);

  var min_corner = min(screen_position, last_screen_position);
  var max_corner = max(screen_position, last_screen_position);

  var corners = array(
    min_corner - vec2f(pointScale, pointScale),
    vec2f(min_corner.x - pointScale, max_corner.y + pointScale),
    vec2f(max_corner.x + pointScale, min_corner.y - pointScale),
    max_corner + vec2f(pointScale, pointScale),
  );

  var vertex_position = corners[quad[vertex_index]];
  
  
  var output_position = vec2(vertex_position.x * 9.0/16.0, vertex_position.y); // aspect ratio correction
  
  var vsOut: VSOutput;
  vsOut.position = vec4f(output_position, 0.0, 1.0);
  vsOut.texcoord = points[vertex_index] * 0.5 + 0.5;
  vsOut.index = particle_index;
  vsOut.skip = f32(fireworks.ttl_offset < 0 || ttl > uniforms.max_ttl);
  vsOut.z_distance = abs(position.z-camera_position.z);
  vsOut.last_coords = last_screen_position;
  vsOut.this_coords = screen_position;
  vsOut.screen_position = vertex_position;
  vsOut.ttl = ttl;
  
  return vsOut;
}


fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
    var pa = p-a;
    var ba = b-a;
    var h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba*h);
}

fn rand(co: vec2f) -> f32 {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}


@fragment
fn fragment(vsOut: VSOutput) -> @location(0) vec4f {
  if (vsOut.skip == 1) {
    return vec4(0);
  }

  let fireworks: Fireworks = fireworks_buffer[vsOut.index / u32(uniforms.particles_per_fireworks)];

  var dist_to_this_coords = distance(vsOut.screen_position, vsOut.this_coords);
  var dist_to_trail = sdSegment(vsOut.screen_position, vsOut.last_coords, vsOut.this_coords);

  var light_color = mix(vec3f(1), fireworks.color.rgb, step(0.005, dist_to_this_coords));
  var light_alpha = mix(1, clamp(1-dist_to_this_coords * 100, 0.0, 1.0), step(0.005, dist_to_this_coords));
  var light = vec4f(light_color, light_alpha);

  var trail_color = vec3f(0.9,0.8,0.6) * vec3f(rand(vsOut.screen_position),rand(vsOut.screen_position+vec2(10,0)), rand(vsOut.screen_position+vec2(20,0)));
  var trail_alpha = max(0.2 - 20 * dist_to_trail, 0.0) * rand(vsOut.screen_position+vec2(30,0));
  var trail = vec4f(trail_color, trail_alpha);

  if (vsOut.ttl < 80) {
    return trail;
  } else {
    return light + trail;
  }
}

`
