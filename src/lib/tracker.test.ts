import { describe, it, expect } from 'vitest';
import { calculateIoU } from './tracker';

describe('tracker logic', () => {
    describe('calculateIoU', () => {
        it('should return 1 for identical boxes', () => {
            const box: [number, number, number, number] = [0, 0, 1, 1];
            expect(calculateIoU(box, box)).toBeCloseTo(1);
        });

        it('should return 0 for non-overlapping boxes', () => {
            const boxA: [number, number, number, number] = [0, 0, 0.1, 0.1];
            const boxB: [number, number, number, number] = [0.5, 0.5, 0.1, 0.1];
            expect(calculateIoU(boxA, boxB)).toBe(0);
        });

        it('should calculate partial overlap correctly', () => {
             // Box A: 0,0 to 2,2 (w=2, h=2) Area=4
             const boxA: [number, number, number, number] = [0, 0, 2, 2];
             
             // Box B: 1,0 to 3,2 (w=2, h=2) Area=4
             const boxB: [number, number, number, number] = [1, 0, 2, 2];
             
             // Intersection: x=1 to x=2 (w=1), y=0 to y=2 (h=2). Area = 2
             // Union = 4 + 4 - 2 = 6
             // IoU = 2/6 = 0.3333...
             
             expect(calculateIoU(boxA, boxB)).toBeCloseTo(1/3);
        });
        
        it('should handle contained boxes', () => {
            // Box A: 0,0 4x4 Area=16
            const boxA: [number, number, number, number] = [0, 0, 4, 4];
            // Box B: 1,1 2x2 Area=4 (Inside A)
            const boxB: [number, number, number, number] = [1, 1, 2, 2];
            
            // Intersection = Box B = 4
            // Union = 16 + 4 - 4 = 16
            // IoU = 4/16 = 0.25
            
            expect(calculateIoU(boxA, boxB)).toBeCloseTo(0.25);
        });
    });
});
