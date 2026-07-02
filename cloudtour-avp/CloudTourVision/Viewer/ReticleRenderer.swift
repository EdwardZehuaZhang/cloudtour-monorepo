#if os(visionOS)

import Foundation
import Metal
import MetalKit
import ModelIO
import simd

/// Renders translucent spheres at a list of world-space positions, sharing
/// the CompositorLayer's color/depth targets with `SplatRenderer`. Used for
/// both the head-ray reticle and the in-scene waypoint markers.
final class ReticleRenderer: @unchecked Sendable {
    enum ReticleError: Error {
        case bufferCreationFailed
        case depthStencilStateCreationFailed
        case badVertexDescriptor
        case shaderCompilationFailed
    }

    struct Marker {
        let worldPosition: SIMD3<Float>
        let radius: Float
        let color: SIMD4<Float>
    }

    private static let maxViewCount = 2

    private struct Uniforms {
        var modelViewProjection: matrix_float4x4
        var color: SIMD4<Float>
    }

    private struct UniformsArray {
        var u0: Uniforms
        var u1: Uniforms

        static var alignedSize: Int {
            (MemoryLayout<UniformsArray>.size + 0xFF) & -0x100
        }
    }

    private let device: MTLDevice
    private let pipelineState: MTLRenderPipelineState
    private let depthState: MTLDepthStencilState
    private let mesh: MTKMesh

    private let dynamicUniformBuffer: MTLBuffer
    private let maxMarkers: Int
    private let maxSimultaneousRenders: Int
    private var frameSlot = 0

    init(device: MTLDevice,
         colorFormat: MTLPixelFormat,
         depthFormat: MTLPixelFormat,
         sampleCount: Int,
         maxViewCount: Int,
         maxMarkers: Int,
         maxSimultaneousRenders: Int) throws {
        self.device = device
        self.maxMarkers = maxMarkers
        self.maxSimultaneousRenders = maxSimultaneousRenders

        let bufferSize = UniformsArray.alignedSize * maxMarkers * maxSimultaneousRenders
        guard let buffer = device.makeBuffer(length: bufferSize, options: .storageModeShared) else {
            throw ReticleError.bufferCreationFailed
        }
        buffer.label = "ReticleUniformBuffer"
        self.dynamicUniformBuffer = buffer

        let vertexDescriptor = MTLVertexDescriptor()
        vertexDescriptor.attributes[0].format = .float3
        vertexDescriptor.attributes[0].offset = 0
        vertexDescriptor.attributes[0].bufferIndex = 0
        vertexDescriptor.layouts[0].stride = MemoryLayout<SIMD3<Float>>.stride
        vertexDescriptor.layouts[0].stepRate = 1
        vertexDescriptor.layouts[0].stepFunction = .perVertex

        let library: MTLLibrary
        do {
            library = try device.makeLibrary(source: Self.shaderSource, options: nil)
        } catch {
            throw ReticleError.shaderCompilationFailed
        }
        let vertexFunction = library.makeFunction(name: "reticleVertex")
        let fragmentFunction = library.makeFunction(name: "reticleFragment")

        let pipelineDescriptor = MTLRenderPipelineDescriptor()
        pipelineDescriptor.label = "ReticlePipeline"
        pipelineDescriptor.rasterSampleCount = sampleCount
        pipelineDescriptor.vertexFunction = vertexFunction
        pipelineDescriptor.fragmentFunction = fragmentFunction
        pipelineDescriptor.vertexDescriptor = vertexDescriptor
        pipelineDescriptor.colorAttachments[0].pixelFormat = colorFormat
        pipelineDescriptor.depthAttachmentPixelFormat = depthFormat
        pipelineDescriptor.maxVertexAmplificationCount = min(maxViewCount, Self.maxViewCount)

        let colorAttachment = pipelineDescriptor.colorAttachments[0]!
        colorAttachment.isBlendingEnabled = true
        colorAttachment.rgbBlendOperation = .add
        colorAttachment.alphaBlendOperation = .add
        colorAttachment.sourceRGBBlendFactor = .sourceAlpha
        colorAttachment.sourceAlphaBlendFactor = .sourceAlpha
        colorAttachment.destinationRGBBlendFactor = .oneMinusSourceAlpha
        colorAttachment.destinationAlphaBlendFactor = .oneMinusSourceAlpha

        self.pipelineState = try device.makeRenderPipelineState(descriptor: pipelineDescriptor)

        let depthDescriptor = MTLDepthStencilDescriptor()
        // SplatRenderer uses reversed-Z with .greater, match that.
        depthDescriptor.depthCompareFunction = .greater
        depthDescriptor.isDepthWriteEnabled = false
        guard let depthState = device.makeDepthStencilState(descriptor: depthDescriptor) else {
            throw ReticleError.depthStencilStateCreationFailed
        }
        self.depthState = depthState

        let allocator = MTKMeshBufferAllocator(device: device)
        let mdlMesh = MDLMesh.newEllipsoid(
            withRadii: SIMD3<Float>(1, 1, 1),
            radialSegments: 24,
            verticalSegments: 16,
            geometryType: .triangles,
            inwardNormals: false,
            hemisphere: false,
            allocator: allocator
        )
        let mdlVertexDescriptor = MTKModelIOVertexDescriptorFromMetal(vertexDescriptor)
        guard let attributes = mdlVertexDescriptor.attributes as? [MDLVertexAttribute] else {
            throw ReticleError.badVertexDescriptor
        }
        attributes[0].name = MDLVertexAttributePosition
        mdlMesh.vertexDescriptor = mdlVertexDescriptor
        self.mesh = try MTKMesh(mesh: mdlMesh, device: device)
    }

    /// Render `markers` as translucent spheres into the given drawable. Uses
    /// the same view matrices as the splat render but loads existing color/
    /// depth instead of clearing, so the spheres composite on top of the
    /// splat.
    func render(markers: [Marker],
                userViewpointMatrices: [matrix_float4x4],
                projectionMatrices: [matrix_float4x4],
                viewports: [MTLViewport],
                colorTexture: MTLTexture,
                depthTexture: MTLTexture,
                rasterizationRateMap: MTLRasterizationRateMap?,
                renderTargetArrayLength: Int,
                to commandBuffer: MTLCommandBuffer) {
        guard !markers.isEmpty else { return }
        let drawCount = min(markers.count, maxMarkers)

        frameSlot = (frameSlot + 1) % maxSimultaneousRenders
        let baseSlot = frameSlot * maxMarkers
        let viewCount = min(userViewpointMatrices.count, Self.maxViewCount)

        for i in 0..<drawCount {
            let marker = markers[i]
            let modelMatrix = matrix4x4_translation(marker.worldPosition.x,
                                                    marker.worldPosition.y,
                                                    marker.worldPosition.z)
                * matrix4x4_scale(marker.radius, marker.radius, marker.radius)

            var array = UniformsArray(
                u0: Uniforms(modelViewProjection: .init(1), color: marker.color),
                u1: Uniforms(modelViewProjection: .init(1), color: marker.color)
            )
            for v in 0..<viewCount {
                let mvp = projectionMatrices[v] * userViewpointMatrices[v] * modelMatrix
                let u = Uniforms(modelViewProjection: mvp, color: marker.color)
                if v == 0 { array.u0 = u } else { array.u1 = u }
            }

            let offset = (baseSlot + i) * UniformsArray.alignedSize
            let ptr = dynamicUniformBuffer.contents()
                .advanced(by: offset)
                .bindMemory(to: UniformsArray.self, capacity: 1)
            ptr.pointee = array
        }

        let passDescriptor = MTLRenderPassDescriptor()
        passDescriptor.colorAttachments[0].texture = colorTexture
        passDescriptor.colorAttachments[0].loadAction = .load
        passDescriptor.colorAttachments[0].storeAction = .store
        passDescriptor.depthAttachment.texture = depthTexture
        passDescriptor.depthAttachment.loadAction = .load
        passDescriptor.depthAttachment.storeAction = .store
        passDescriptor.rasterizationRateMap = rasterizationRateMap
        passDescriptor.renderTargetArrayLength = renderTargetArrayLength

        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDescriptor) else {
            return
        }
        encoder.label = "Reticle Encoder"
        encoder.setViewports(viewports)

        if viewports.count > 1 {
            var viewMappings = (0..<viewports.count).map {
                MTLVertexAmplificationViewMapping(
                    viewportArrayIndexOffset: UInt32($0),
                    renderTargetArrayIndexOffset: UInt32($0)
                )
            }
            encoder.setVertexAmplificationCount(viewports.count, viewMappings: &viewMappings)
        }

        encoder.setCullMode(.back)
        encoder.setFrontFacing(.counterClockwise)
        encoder.setRenderPipelineState(pipelineState)
        encoder.setDepthStencilState(depthState)

        let vertexBuffer = mesh.vertexBuffers[0]
        encoder.setVertexBuffer(vertexBuffer.buffer, offset: vertexBuffer.offset, index: 0)
        // Initial bind; per-marker we then rebind via setVertexBufferOffset.
        encoder.setVertexBuffer(dynamicUniformBuffer,
                                offset: baseSlot * UniformsArray.alignedSize,
                                index: 1)

        for i in 0..<drawCount {
            let offset = (baseSlot + i) * UniformsArray.alignedSize
            encoder.setVertexBufferOffset(offset, index: 1)
            for submesh in mesh.submeshes {
                encoder.drawIndexedPrimitives(
                    type: submesh.primitiveType,
                    indexCount: submesh.indexCount,
                    indexType: submesh.indexType,
                    indexBuffer: submesh.indexBuffer.buffer,
                    indexBufferOffset: submesh.indexBuffer.offset
                )
            }
        }

        encoder.endEncoding()
    }

    private static let shaderSource = """
    #include <metal_stdlib>
    #include <simd/simd.h>
    using namespace metal;

    struct Uniforms {
        float4x4 modelViewProjection;
        float4 color;
    };

    struct UniformsArray {
        Uniforms u[2];
    };

    struct VertexIn {
        float3 position [[attribute(0)]];
    };

    struct VertexOut {
        float4 position [[position]];
        float4 color;
    };

    vertex VertexOut reticleVertex(
        VertexIn in [[stage_in]],
        ushort amp_id [[amplification_id]],
        constant UniformsArray &uniformsArray [[buffer(1)]]
    ) {
        VertexOut out;
        int clampedId = min(int(amp_id), 1);
        Uniforms u = uniformsArray.u[clampedId];
        out.position = u.modelViewProjection * float4(in.position, 1.0);
        out.color = u.color;
        return out;
    }

    fragment float4 reticleFragment(VertexOut in [[stage_in]]) {
        return in.color;
    }
    """
}

func matrix4x4_scale(_ sx: Float, _ sy: Float, _ sz: Float) -> matrix_float4x4 {
    matrix_float4x4(columns: (
        vector_float4(sx, 0, 0, 0),
        vector_float4(0, sy, 0, 0),
        vector_float4(0, 0, sz, 0),
        vector_float4(0, 0, 0, 1)
    ))
}

#endif
