
import { Player, Platform, Particle, BackgroundElement, Theme, TrailPoint, PlatformType } from '../types';
import {
  GRAVITY,
  JUMP_ADDITIONAL_FORCE,
  INITIAL_SPEED,
  SPEED_INCREMENT,
  MAX_SPEED,
  SPEED_WAVE_DURATION,
  SPEED_WAVE_AMPLITUDE,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_X_OFFSET,
  PLATFORM_MIN_WIDTH,
  PLATFORM_MAX_WIDTH,
  GAP_MIN_MULTIPLIER,
  GAP_MAX_MULTIPLIER,
  CANVAS_HEIGHT,
  PLATFORM_COLOR,
  PLATFORM_TYPES,
  PLATFORM_HEIGHT
} from '../constants';

// --- Procedural Generation ---

export const generatePlatform = (prevPlatform: Platform | null, difficultyMultiplier: number): Platform => {
  let x = 0;
  let y = CANVAS_HEIGHT - 150;
  let width = 1000; 

  if (prevPlatform) {
    const minGap = INITIAL_SPEED * GAP_MIN_MULTIPLIER * difficultyMultiplier;
    const maxGap = INITIAL_SPEED * GAP_MAX_MULTIPLIER * difficultyMultiplier;
    const gap = Math.random() * (maxGap - minGap) + minGap;

    x = prevPlatform.x + prevPlatform.width + gap;
    
    width = Math.random() * (PLATFORM_MAX_WIDTH - PLATFORM_MIN_WIDTH) + PLATFORM_MIN_WIDTH;
    width = Math.max(PLATFORM_MIN_WIDTH, width * (1.2 - difficultyMultiplier * 0.2));

    const maxJumpHeight = 220; 
    const reachableHeightChange = maxJumpHeight * 0.7; 
    
    const minY = 200; 
    const maxY = CANVAS_HEIGHT - 100; 
    
    let nextY = prevPlatform.y + (Math.random() * reachableHeightChange * 2 - reachableHeightChange);
    
    if (nextY < minY) nextY = minY + Math.random() * 100;
    if (nextY > maxY) nextY = maxY - Math.random() * 100;

    y = nextY;
  }

  // Determine Platform Type
  const roll = Math.random();
  let type: PlatformType = 'default';
  
  // 10% chance for Green, 5% for Rare, 5% for Hazard
  if (roll < 0.05) type = 'hazard';
  else if (roll < 0.10) type = 'rare';
  else if (roll < 0.20) type = 'green';

  return {
    x,
    y,
    width,
    height: PLATFORM_HEIGHT,
    id: Date.now() + Math.random(),
    type
  };
};

export const updateBackgroundElements = (elements: BackgroundElement[], width: number, height: number, speed: number): BackgroundElement[] => {
  // Legacy function kept to avoid breaking changes, but stripes are mostly replaced by 3D BG
  return []; 
};

// --- Physics ---

export const getSpeedMultiplier = (tick: number): number => {
  // Create a wave effect: 1.0 -> 1.2 -> 1.0 -> 0.8 -> 1.0
  const phase = (tick % SPEED_WAVE_DURATION) / SPEED_WAVE_DURATION;
  return 1 + Math.sin(phase * Math.PI * 2) * 0.2; 
};

export const updatePlayer = (
  player: Player, 
  platforms: Platform[], 
  baseSpeed: number, 
  speedMultiplier: number,
  isHoldingJump: boolean
): { updatedPlayer: Player, landedPlatform: Platform | null } => {
  const newPlayer = { ...player };
  const currentSpeed = baseSpeed * speedMultiplier;
  let landedPlatform: Platform | null = null;

  // Jump Sustain
  if (isHoldingJump && newPlayer.jumpHoldTimer > 0) {
    newPlayer.vy += JUMP_ADDITIONAL_FORCE;
    newPlayer.jumpHoldTimer--;
  } else {
    newPlayer.jumpHoldTimer = 0;
  }

  // Gravity
  newPlayer.vy += GRAVITY;
  newPlayer.y += newPlayer.vy;
  newPlayer.x += currentSpeed; 

  // Trail History Recording
  // Only record every few pixels to save performance and make the ribbon smoother
  if (newPlayer.trailHistory.length === 0 || 
      Math.abs(newPlayer.trailHistory[newPlayer.trailHistory.length - 1].x - newPlayer.x) > 10) {
    
    newPlayer.trailHistory.push({
      x: newPlayer.x,
      y: newPlayer.y,
      vy: newPlayer.vy,
      age: 0
    });
    
    // Limit trail length based on visual need (approx 100 points is huge trail)
    if (newPlayer.trailHistory.length > 50) {
      newPlayer.trailHistory.shift();
    }
  }

  // Ground Detection
  newPlayer.isGrounded = false;
  let landedThisFrame = false;

  for (const platform of platforms) {
    if (newPlayer.vy >= 0) {
      const prevBottom = player.y + player.height;
      
      if (
        newPlayer.x + newPlayer.width > platform.x + 10 && 
        newPlayer.x < platform.x + platform.width - 5
      ) {
         if (
           newPlayer.y + newPlayer.height >= platform.y && 
           prevBottom <= platform.y + newPlayer.vy + 5 
         ) {
           newPlayer.y = platform.y - newPlayer.height;
           newPlayer.vy = 0;
           newPlayer.isGrounded = true;
           newPlayer.isJumping = false;
           newPlayer.jumpHoldTimer = 0;
           landedThisFrame = true;
           landedPlatform = platform;
           break; 
         }
      }
    }
  }

  const isGrounded = landedThisFrame || newPlayer.isGrounded;
  
  return { 
    updatedPlayer: { ...newPlayer, isGrounded }, 
    landedPlatform 
  };
};


// --- Rendering ---

export const drawComplexTrail = (
  ctx: CanvasRenderingContext2D,
  player: Player,
  cameraX: number,
  theme: Theme,
  score: number,
  speedPhase: number
) => {
  if (player.trailHistory.length < 2) return;

  // Trail Evolution Styles based on score
  const isAdvancedTrail = score > 150;
  const isPulseTrail = score > 300;
  const isMasterTrail = score > 600;

  ctx.beginPath();
  
  // Draw Ribbon
  for (let i = 0; i < player.trailHistory.length; i++) {
    const point = player.trailHistory[i];
    const screenX = point.x - cameraX;
    
    // Center of player
    const px = screenX + player.width / 2;
    const py = point.y + player.height / 2;

    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      // Curve smoothing
      const prev = player.trailHistory[i-1];
      const prevScreenX = prev.x - cameraX;
      const prevPx = prevScreenX + player.width / 2;
      const prevPy = prev.y + player.height / 2;
      
      const cx = (prevPx + px) / 2;
      const cy = (prevPy + py) / 2;
      ctx.quadraticCurveTo(prevPx, prevPy, cx, cy);
    }
  }
  
  // Connect to current player position
  const currentCx = (player.x - cameraX) + player.width / 2;
  const currentCy = player.y + player.height / 2;
  ctx.lineTo(currentCx, currentCy);

  // Line Styling
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Base Glow
  ctx.shadowBlur = isAdvancedTrail ? 20 : 10;
  ctx.shadowColor = theme.primary;
  
  // Speed Waves Visuals:
  // Fast Phase (>1) -> Thinner trail (down to ~50%)
  // Slow Phase (<1) -> Thicker trail (up to ~200%)
  const baseWidth = isAdvancedTrail ? 6 : 4;
  
  // Cubic power emphasizes the effect at extremes (0.8 -> 1.95x, 1.2 -> 0.57x)
  const widthMod = Math.pow(1 / speedPhase, 3);
  const dynamicWidth = Math.max(1, baseWidth * widthMod);

  ctx.lineWidth = dynamicWidth;

  // Dynamic Stroke Color (Heat)
  const speedHeat = Math.min(Math.abs(player.vy) * 5, 50); // 0-50 lightness boost
  ctx.strokeStyle = theme.primary;

  if (isPulseTrail) {
     const hue = (Date.now() / 10) % 360;
     ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`;
     ctx.shadowColor = `hsl(${hue}, 80%, 60%)`;
  }

  // Heat flash on jump/turn
  if (Math.abs(player.vy) > 8) {
     ctx.strokeStyle = '#FFFFFF';
     ctx.shadowColor = '#FFFFFF';
     ctx.shadowBlur = 30;
  }

  ctx.stroke();
  
  // Reset
  ctx.shadowBlur = 0;
};

const drawPlatform = (
  ctx: CanvasRenderingContext2D,
  platform: Platform,
  screenX: number
) => {
  const { width, height, type } = platform;
  const cfg = PLATFORM_TYPES[type] || PLATFORM_TYPES.default;

  const y = platform.y;
  const radius = 4;

  // 1. Background Rounded Rect with Gradient
  const gradient = ctx.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, cfg.gradient[0]);
  gradient.addColorStop(1, cfg.gradient[1]);
  ctx.fillStyle = gradient;

  ctx.beginPath();
  // Modern browsers support roundRect, but for safety manual path:
  ctx.moveTo(screenX + radius, y);
  ctx.lineTo(screenX + width - radius, y);
  ctx.quadraticCurveTo(screenX + width, y, screenX + width, y + radius);
  ctx.lineTo(screenX + width, y + height - radius);
  ctx.quadraticCurveTo(screenX + width, y + height, screenX + width - radius, y + height);
  ctx.lineTo(screenX + radius, y + height);
  ctx.quadraticCurveTo(screenX, y + height, screenX, y + height - radius);
  ctx.lineTo(screenX, y + radius);
  ctx.quadraticCurveTo(screenX, y, screenX + radius, y);
  ctx.fill();

  // 2. Angled Stripes (Clipped)
  ctx.save();
  ctx.beginPath();
  ctx.rect(screenX, y, width, height);
  ctx.clip();

  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(255,255,255,${cfg.stripeOpacity})`;
  
  const stripeSpacing = 20;
  const angleOffset = 20;

  // Simple animation for stripes effect
  const offset = (Date.now() / 50) % stripeSpacing;

  for (let sx = screenX - 30 + offset; sx <= screenX + width + 30; sx += stripeSpacing) {
    ctx.beginPath();
    ctx.moveTo(sx, y - angleOffset);
    ctx.lineTo(sx + 20, y + height + angleOffset); 
    ctx.stroke();
  }

  ctx.restore();
};

export const drawGame = (
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  player: Player, 
  platforms: Platform[],
  particles: Particle[],
  bgElements: BackgroundElement[],
  cameraX: number,
  score: number,
  theme: Theme,
  speedPhase: number // ~0.8 (slow) to ~1.2 (fast)
) => {
  // Clear with transparency to let GridScan background show through
  ctx.clearRect(0, 0, width, height);

  // Platforms
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur = 0; 
  
  platforms.forEach((platform) => {
    const screenX = platform.x - cameraX;
    if (screenX + platform.width > -100 && screenX < width + 100) {
      drawPlatform(ctx, platform, screenX);
    }
  });

  // Complex Trail
  drawComplexTrail(ctx, player, cameraX, theme, score, speedPhase);

  // Player Rendering
  const playerScreenX = player.x - cameraX;
  
  // "Speed Phase" Visuals: Player stretches or glows more at high speed
  const stretch = speedPhase > 1.0 ? (speedPhase - 1.0) * 10 : 0;
  const isBoosting = player.isJumping && player.jumpHoldTimer > 0;
  const boostStretch = isBoosting ? 6 : 0;

  // Thruster Effect
  if (isBoosting) {
    const px = playerScreenX + player.width / 2;
    const py = player.y + player.height + boostStretch;
    
    // Core flame
    ctx.beginPath();
    ctx.moveTo(px - 6, py - 4);
    ctx.lineTo(px + 6, py - 4);
    ctx.lineTo(px, py + 15 + Math.random() * 15);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    
    // Inner white hot flame
    ctx.beginPath();
    ctx.moveTo(px - 3, py - 4);
    ctx.lineTo(px + 3, py - 4);
    ctx.lineTo(px, py + 8 + Math.random() * 5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    
    // Add some glow
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 20;
  }

  // Draw Player Body
  const drawY = player.y - boostStretch/2;
  const drawH = player.height + boostStretch;
  
  // Default Style
  ctx.fillStyle = theme.primary;
  ctx.shadowColor = theme.primary;
  ctx.globalAlpha = 1.0;
  
  let blurAmount = 20;

  // SPEED PHASE VISUALS
  // Fast Phase (speedPhase > 1) -> Brighter / White
  // Slow Phase (speedPhase < 1) -> Dimmer / Transparent
  
  if (speedPhase > 1.1) { 
      // Very Fast: White hot glow
      blurAmount = 40 + stretch * 10;
      ctx.fillStyle = '#FFFFFF'; 
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = blurAmount;
  } else if (speedPhase < 0.9) { 
      // Slow: Dim and translucent
      blurAmount = 5; 
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = blurAmount;
  } else {
      // Normal
      if (speedPhase > 1.0) blurAmount += stretch * 10;
      ctx.shadowBlur = blurAmount;
  }

  if (isBoosting) {
    blurAmount = 40;
    ctx.shadowBlur = blurAmount;
    ctx.globalAlpha = 1.0; // Boost always bright
  }

  ctx.fillRect(playerScreenX - stretch, drawY, player.width + stretch, drawH);
  
  // Center White Hot Core (Inner Square)
  // Expands when fast, shrinks when slow
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowBlur = 0; // Clean core
  
  let coreInset = 10;
  if (speedPhase > 1.1) coreInset = 5; // Larger core (more white)
  if (speedPhase < 0.9) coreInset = 16; // Smaller core (less white)

  if (coreInset < player.width/2) {
    ctx.fillRect(playerScreenX + coreInset - stretch, drawY + coreInset, player.width - (coreInset*2) + stretch, drawH - (coreInset*2));
  }

  // Reset context
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;

  // Particles
  particles.forEach(p => {
    const pScreenX = p.x - cameraX;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(pScreenX, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  });
};

export const createExplosion = (x: number, y: number, color: string): Particle[] => {
  const particles: Particle[] = [];
  for(let i=0; i<12; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      life: 1.0,
      color: color,
      size: Math.random() * 5 + 2
    });
  }
  return particles;
};
