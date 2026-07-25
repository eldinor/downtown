import type { CityBlockConfig } from "../core/contracts";

const blockSpacing = 24;

export const cityCenterBlocks: CityBlockConfig[] = Array.from(
  { length: 9 },
  (_, index) => {
    const gridX = (index % 3) - 1;
    const gridZ = Math.floor(index / 3) - 1;
    const x = gridX * blockSpacing;
    const z = gridZ * blockSpacing;

    return {
      id: `block-${gridX + 1}-${gridZ + 1}`,
      grid: [gridX, gridZ],
      roads: [
        {
          asset: "Street_2Lane",
          position: [x, 0, z],
        },
      ],
      sidewalks: [
        {
          asset: "Sidewalk_Straight_3m",
          position: [x + 4.5, 0.01, z],
        },
      ],
      buildings: [
        {
          asset: "Building_Medium_2_001",
          position: [x + 6, 0, z],
          rotationY: -Math.PI / 2,
          variant: index,
        },
      ],
      props: [],
    };
  },
);
