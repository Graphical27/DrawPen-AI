
import { colorList } from '../components/constants.js';

export const parseLocalPrompt = (prompt, canvasWidth, canvasHeight) => {
  const p = prompt.toLowerCase().trim();

  // --- 1. Matrices / Arrays ---
  const matrixMatch = p.match(/(?:empty\s+)?(?:array|matrix|grid)\s+(\d+)x(\d+)|(\d+)x(\d+)\s+(?:array|matrix|grid)/);
  if (matrixMatch) {
    const rows = parseInt(matrixMatch[1] || matrixMatch[3]);
    const cols = parseInt(matrixMatch[2] || matrixMatch[4]);
    
    if (rows > 0 && cols > 0 && rows <= 20 && cols <= 20) {
      return generateMatrix(rows, cols, canvasWidth, canvasHeight);
    }
  }

  // --- 2. Text ---
  if (p.startsWith('text ') || p.startsWith('write ')) {
    const textContent = prompt.substring(prompt.indexOf(' ') + 1);
    if (textContent.trim()) {
      return [{
        id: Date.now(),
        type: 'text',
        text: textContent,
        points: [[canvasWidth / 2 - 100, canvasHeight / 2]],
        colorIndex: 1,
        widthIndex: 2,
        scale: 1,
        width: 200,
        height: 50
      }];
    }
  }

  // --- 3. Basic Shapes + Color ---
  const colors = colorList.map(c => c.name.replace('color_', '')); 
  
  const shapes = ['circle', 'oval', 'box', 'square', 'rectangle', 'rect', 'line', 'arrow'];
  
  const colorMatch = colors.find(c => p.includes(c));
  const shapeMatch = shapes.find(s => p.includes(s));

  if (colorMatch && shapeMatch) {
    const colorIndex = colorList.findIndex(c => c.name === `color_${colorMatch}`);
    
    let type = 'rectangle';
    if (['circle', 'oval'].includes(shapeMatch)) type = 'oval';
    if (['line'].includes(shapeMatch)) type = 'line';
    if (['arrow'].includes(shapeMatch)) type = 'arrow';

    return generateShape(type, colorIndex, canvasWidth, canvasHeight);
  }

  return null;
};

const generateMatrix = (rows, cols, w, h) => {
  const figures = [];
  const padding = 20;
  
  const availW = w * 0.6;
  const availH = h * 0.6;
  
  const cellW = availW / cols;
  const cellH = availH / rows;
  
  const startX = (w - availW) / 2;
  const startY = (h - availH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * cellW;
      const y = startY + r * cellH;
      
      figures.push({
        id: Date.now() + Math.random(),
        type: 'rectangle',
        points: [[x, y], [x + cellW, y + cellH]],
        colorIndex: 1,
        widthIndex: 1,
        ratio: 0
      });
    }
  }
  return figures;
};

const generateShape = (type, colorIndex, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const size = 200;
  
  const p1 = [cx - size/2, cy - size/2];
  const p2 = [cx + size/2, cy + size/2];

  if (type === 'line' || type === 'arrow') {
      return [{
          id: Date.now(),
          type,
          points: [[cx - size/2, cy], [cx + size/2, cy]],
          colorIndex,
          widthIndex: 2
      }];
  }

  return [{
      id: Date.now(),
      type,
      points: [p1, p2],
      colorIndex,
      widthIndex: 2
  }];
};
