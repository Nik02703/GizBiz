/**
 * Analysis data model — JSDoc type definitions
 *
 * Future-ready schema that can expand to include:
 * sensor info, temporal data, detected objects with coordinates,
 * spatial regions, and execution metadata.
 */

/**
 * @typedef {object} AOI
 * @property {{ lat: number, lng: number }} center
 * @property {{ north: number, south: number, east: number, west: number }} bounds
 * @property {string} area - Human-readable area string
 * @property {number} areaKm2 - Area in square kilometers
 * @property {string} type - 'rectangle' | 'polygon'
 * @property {Array<[number, number]>} coordinates - Polygon vertices
 */

/**
 * @typedef {object} Observation
 * @property {string} label
 * @property {string} description
 * @property {number} confidence - 0.0 to 1.0
 */

/**
 * @typedef {object} AnalysisResult
 * @property {string} analysis_type
 * @property {string} answer
 * @property {number} confidence - 0.0 to 1.0
 * @property {string[]} evidence
 * @property {Observation[]} observations
 * @property {AnalysisMetadata} metadata
 */

/**
 * @typedef {object} AnalysisMetadata
 * @property {string} model - AI model used
 * @property {number} processing_time_ms
 * @property {string} timestamp - ISO 8601
 * @property {AOI|null} aoi
 * @property {string} route - Analysis module used
 * @property {string} category
 */

/**
 * @typedef {object} HistoryEntry
 * @property {string} id
 * @property {string} query
 * @property {string} location - Reverse geocoded or AOI description
 * @property {string} timestamp - ISO 8601
 * @property {AnalysisResult} result
 * @property {string|null} imageThumbnail - Base64 thumbnail
 * @property {AOI|null} aoi
 */

/**
 * Future-ready fields (not yet populated):
 *
 * @typedef {object} FutureAnalysisFields
 * @property {string} sensor - e.g. 'Sentinel-2', 'Landsat-8'
 * @property {string} imageType - 'optical' | 'SAR' | 'multispectral'
 * @property {string} acquisitionDate - ISO date
 * @property {number} resolution - Meters per pixel
 * @property {Array<DetectedObject>} detectedObjects
 * @property {Array<SpatialRegion>} spatialRegions
 * @property {TemporalInfo} temporalInfo
 */

export {};
