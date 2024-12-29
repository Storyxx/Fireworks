
class WebGPUHandler {
    constructor() {
        this.lastNow = 0;
        this.frame = 0;
        this.maxTTL = 200;
        this.particleSpeed = 1;
    }

    initGraphicsPipeline(device, format) {
        const descriptor = {
            layout: 'auto',
            vertex: {
                module: device.createShaderModule({
                    code: fireworks_render_shader
                }),
                entryPoint: 'vertex',
            },
            fragment: {
                module: device.createShaderModule({
                    code: fireworks_render_shader
                }),
                entryPoint: 'fragment',
                targets: [
                    {
                    format: format,
                    blend: {
                        color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
                        alpha: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }
                    }
                    }
                ]
            }
        }

        return device.createRenderPipelineAsync(descriptor)
    }

    initComputePipeline(device) {
        const descriptor = {
            layout: 'auto',
            compute: {
                module: device.createShaderModule({
                    code: fireworks_compute_shader 
                }),
                entryPoint: 'compute'
            }
        }
        return device.createComputePipelineAsync(descriptor);
    }

    async init() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported on this browser.");
        }

        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        this.device = await this.adapter.requestDevice();
        this.canvas = document.querySelector("canvas");
        this.context = this.canvas.getContext("webgpu");
        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.canvasFormat,
            alphaMode: 'premultiplied',
        });


        this.graphicsPipeline = await this.initGraphicsPipeline(this.device, this.canvasFormat)
        this.computePipeline = await this.initComputePipeline(this.device)


        // create uniform buffer
        this.uniformValues = new ArrayBuffer(24 * 4);
        this.uniformBuffer = this.device.createBuffer({
            label: "uniform buffer",
            size: this.uniformValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });


        this.particleCount = 10000;
        this.fireworksCount = 20;
        this.particlesPerFireworks = this.particleCount / this.fireworksCount;
        
        this.fireworksSize = 12;
        this.fireworksData = new Float32Array(this.fireworksCount * this.fireworksSize);

        for (var i=0; i<this.fireworksCount; i++) {
            this.fireworksData[i*this.fireworksSize + 4] = this.maxTTL; // ttlOffset
        }


        this.fireworksBuffer = this.device.createBuffer({
            label: "fireworks buffer",
            size: this.fireworksData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(this.fireworksBuffer, 0, this.fireworksData);



        this.particleSize = 16;
        this.particleData = new Float32Array(this.particleCount * this.particleSize);

        this.particleBuffer = this.device.createBuffer({
            label: "particle buffer",
            size: this.particleData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(this.particleBuffer, 0, this.particleData);
    }


    _hsl2rgb(h,s,l) {
        let a = s*Math.min(l,1-l);
        let f = (n,k=(n+h/30)%12) => l - a*Math.max(Math.min(k-3,9-k,1),-1);
        return {r: f(0),g: f(8),b: f(4)};
    }   


    async render() {
        requestAnimationFrame(this.draw_fireworks.bind(this));
    }

    async draw_fireworks(now) {
        const deltaT = (now - this.lastNow);
        this.lastNow = now;

        const modelMatrixView = new Float32Array(this.uniformValues, 0*4, 16);
        const angle = now*0.0001;
        modelMatrixView.set([
            Math.cos(angle), 0, Math.sin(angle), 0,
            0, 1, 0, 0,
            -Math.sin(angle), 0, Math.cos(angle), 0,
            0, 0, 0, 1
        ]);

        const dataView = new Float32Array(this.uniformValues, 16*4, 5);
        dataView.set([
            deltaT,
            now,
            this.frame,
            this.particlesPerFireworks,
            this.maxTTL,
        ]);

        this.frame++;




        for (var i=0; i<this.fireworksCount; i++) {
            if (this.fireworksData[i*this.fireworksSize + 4] >= this.maxTTL) {

                const color = this._hsl2rgb(Math.random()*360, 1.0, 0.5);

                this.fireworksData[i*this.fireworksSize + 0] = (Math.random()*2-1) * 0.8; // center x
                this.fireworksData[i*this.fireworksSize + 1] = (Math.random()*2-1) * 0.5; // center y
                this.fireworksData[i*this.fireworksSize + 2] = (Math.random()*2-1) * 0.8; // center z
                this.fireworksData[i*this.fireworksSize + 3] = 0; // padding
                this.fireworksData[i*this.fireworksSize + 4] = -400 * Math.random()-200; // ttlOffset
                this.fireworksData[i*this.fireworksSize + 5] = 1; // reset
                this.fireworksData[i*this.fireworksSize + 6] = Math.random();
                this.fireworksData[i*this.fireworksSize + 7] = Math.random(); // padding
                this.fireworksData[i*this.fireworksSize + 8] = color.r; // color red
                this.fireworksData[i*this.fireworksSize + 9] = color.g; // color green
                this.fireworksData[i*this.fireworksSize + 10] = color.b; // color blue
                this.fireworksData[i*this.fireworksSize + 11] = 0; // padding
            } else {
                this.fireworksData[i*this.fireworksSize + 4]++; // ttlOffset
                this.fireworksData[i*this.fireworksSize + 5] = 0; // reset
            }
        }

        this.device.queue.writeBuffer(this.fireworksBuffer, 0, this.fireworksData);


        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformValues);

        const graphicsBindGroup = this.device.createBindGroup({
            label: 'graphics bind group',
            layout: this.graphicsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.particleBuffer } },
                { binding: 2, resource: { buffer: this.fireworksBuffer } },
            ],
        });

        const computeBindGroup = this.device.createBindGroup({
            label: 'compute bind group',
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.particleBuffer } },
                { binding: 2, resource: { buffer: this.fireworksBuffer } },
            ],
        });


        const renderPassDescriptor = {
            colorAttachments: [
              {
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear', // clear/load
                storeOp: 'store' // store/discard
              }
            ]
          }


        const encoder = this.device.createCommandEncoder();


        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
        computePass.end();

        const renderPass = encoder.beginRenderPass(renderPassDescriptor);
        renderPass.setPipeline(this.graphicsPipeline);
        renderPass.setBindGroup(0, graphicsBindGroup);
        renderPass.draw(6, this.particleCount)
        renderPass.end();

        this.device.queue.submit([encoder.finish()]);

        requestAnimationFrame(this.draw_fireworks.bind(this));
    }
}
