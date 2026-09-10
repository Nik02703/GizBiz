import { queryOSM } from './services/osmService.js';

async function test() {
  try {
    console.log('Testing Ahmedabad query...');
    const result = await queryOSM({
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [72.565, 23.015],
            [72.580, 23.015],
            [72.580, 23.030],
            [72.565, 23.030],
            [72.565, 23.015]
          ]
        ]
      },
      features: ['buildings', 'roads', 'water', 'waterways', 'railways', 'pois']
    });
    console.log('Success! Feature counts:', result.metadata.featureCount);
    console.log('Total features:', result.metadata.totalFeatures);
  } catch (err) {
    console.error('Error during queryOSM:', err);
  }
}

test();
