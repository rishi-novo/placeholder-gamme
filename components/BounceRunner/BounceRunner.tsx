
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  GameStatus, 
  Player, 
  Platform, 
  Particle,
  Theme,
  BackgroundElement,
  SaveData
} from '../../types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  PLAYER_WIDTH, 
  PLAYER_HEIGHT, 
  PLAYER_X_OFFSET, 
  INITIAL_SPEED, 
  SPEED_INCREMENT, 
  MAX_SPEED, 
  JUMP_FORCE, 
  MAX_JUMP_FRAMES,
  STORAGE_KEY_DATA,
  PLATFORM_BUFFER_COUNT,
  THEMES,
  PLATFORM_TYPES
} from '../../constants';
import { 
  generatePlatform, 
  updatePlayer, 
  drawGame,
  createExplosion,
  updateBackgroundElements,
  getSpeedMultiplier
} from '../../utils/gameLogic';
import { audioManager } from '../../utils/audioManager';
import GameOverlay from './GameOverlay';
import GridScan from '../Background/GridScan';

const BounceRunner: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [status, setStatus] = useState<GameStatus>(GameStatus.MENU);
  const [score, setScore] = useState(0);
  
  // Persistence State
  const [highScore, setHighScore] = useState(0);
  const [unlockedThemes, setUnlockedThemes] = useState<string[]>(['default']);
  const [currentThemeId, setCurrentThemeId] = useState<string>('default');

  // Mutable game state
  const gameState = useRef({
    player: {
      x: 0,
      y: CANVAS_HEIGHT - 100,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      isJumping: false,
      isGrounded: true,
      jumpCount: 0,
      jumpHoldTimer: 0,
      trailHistory: [],
    } as Player,
    platforms: [] as Platform[],
    particles: [] as Particle[],
    bgElements: [] as BackgroundElement[],
    baseSpeed: INITIAL_SPEED,
    tick: 0, // Global frame counter for waves
    cameraX: 0,
    score: 0,
    bonusScore: 0,
    isRunning: false,
    isHoldingJump: false,
  });

  // Load Data
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DATA);
      if (saved) {
        const data: SaveData = JSON.parse(saved);
        setHighScore(data.highScore || 0);
        setUnlockedThemes(data.unlockedThemes || ['default']);
        setCurrentThemeId(data.selectedThemeId || 'default');
      }
    } catch (e) {
      console.warn('Failed to load save data', e);
    }
  }, []);

  // Save Data Helper
  const persistData = (newHighScore: number, newUnlockedThemes: string[]) => {
    const data: SaveData = {
      highScore: newHighScore,
      unlockedThemes: newUnlockedThemes,
      selectedThemeId: currentThemeId,
      totalDistance: 0 // Could track lifetime stats here
    };
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
  };

  const initGame = useCallback(() => {
    // Start Audio
    audioManager.init();
    audioManager.resume();

    const startPlatform: Platform = {
      x: -50,
      y: CANVAS_HEIGHT - 100,
      width: 1500,
      height: 40,
      id: 0,
      type: 'default'
    };
    
    const platforms = [startPlatform];
    for (let i = 0; i < PLATFORM_BUFFER_COUNT; i++) {
      platforms.push(generatePlatform(platforms[platforms.length - 1], 1));
    }

    gameState.current = {
      player: {
        x: 0,
        y: startPlatform.y - PLAYER_HEIGHT,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
        vx: 0,
        vy: 0,
        isJumping: false,
        isGrounded: true,
        jumpCount: 0,
        jumpHoldTimer: 0,
        trailHistory: [],
      },
      platforms,
      particles: [],
      bgElements: [],
      baseSpeed: INITIAL_SPEED,
      tick: 0,
      cameraX: -PLAYER_X_OFFSET,
      score: 0,
      bonusScore: 0,
      isRunning: true,
      isHoldingJump: false,
    };

    setStatus(GameStatus.PLAYING);
    setScore(0);
  }, []);

  const handleJumpStart = useCallback(() => {
    const { isRunning, player } = gameState.current;
    
    // Init audio context on first interaction if blocked
    audioManager.resume();

    gameState.current.isHoldingJump = true;

    if (!isRunning) return;

    if (player.isGrounded) {
      player.vy = JUMP_FORCE;
      player.isGrounded = false;
      player.isJumping = true;
      player.jumpHoldTimer = MAX_JUMP_FRAMES;
      
      const theme = THEMES.find(t => t.id === currentThemeId) || THEMES[0];
      gameState.current.particles.push(
        ...createExplosion(player.x + player.width/2, player.y + player.height, theme.primary)
      );

      audioManager.playJump();
    }
  }, [currentThemeId]);

  const handleJumpEnd = useCallback(() => {
    gameState.current.isHoldingJump = false;
  }, []);

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (status === GameStatus.MENU || status === GameStatus.GAME_OVER) initGame();
        else handleJumpStart();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleJumpEnd();
      }
    };
    const handleStart = (e: Event) => {
        // e.preventDefault(); // removed to allow button clicks in menu
        if (status === GameStatus.PLAYING) handleJumpStart();
    };
    const handleEnd = () => handleJumpEnd();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    // Bind to window for global game input
    window.addEventListener('mousedown', handleStart);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchstart', handleStart, {passive: false});
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchstart', handleStart);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [status, initGame, handleJumpStart, handleJumpEnd]);

  // Main Loop
  const loop = useCallback(() => {
    // Always run loop to update GridScan and visuals even if paused
    // if (!gameState.current.isRunning && status === GameStatus.PLAYING) return;
    
    const state = gameState.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx) return;

    if (state.isRunning) {
      state.tick++;

      // 1. Difficulty & Speed Phase
      if (state.baseSpeed < MAX_SPEED) {
        state.baseSpeed += SPEED_INCREMENT;
      }
      const speedMultiplier = getSpeedMultiplier(state.tick);
      
      // Update Audio Drone
      audioManager.updateDrone((state.baseSpeed * speedMultiplier) / MAX_SPEED);

      // 2. Physics
      const wasGrounded = state.player.isGrounded;
      const { updatedPlayer, landedPlatform } = updatePlayer(
        state.player, 
        state.platforms, 
        state.baseSpeed, 
        speedMultiplier, 
        state.isHoldingJump
      );
      state.player = updatedPlayer;

      // Land Sound & Logic
      if (!wasGrounded && state.player.isGrounded) {
         audioManager.playLand();
         
         const theme = THEMES.find(t => t.id === currentThemeId) || THEMES[0];
         state.particles.push(
            ...createExplosion(state.player.x + state.player.width/2, state.player.y + state.player.height, theme.accent)
         );

         // Handle special platforms
         if (landedPlatform) {
            const pType = PLATFORM_TYPES[landedPlatform.type];
            if (pType && pType.scoreBonus !== 0) {
              state.bonusScore += pType.scoreBonus;
              
              // Special visual for bonus
              if (pType.scoreBonus > 0) {
                 state.particles.push(
                   ...createExplosion(state.player.x, state.player.y, '#FFD700')
                 );
              }
            }
         }
      }

      state.cameraX = state.player.x - PLAYER_X_OFFSET;
      
      const distanceScore = state.player.x / 100;
      state.score = distanceScore + state.bonusScore;

      if (Math.floor(state.player.x) % 10 === 0) {
        setScore(state.score);
      }

      // 3. Platform Gen
      const rightMost = state.platforms[state.platforms.length - 1];
      if (rightMost.x < state.cameraX + CANVAS_WIDTH + 800) {
         const diff = Math.min(state.baseSpeed / INITIAL_SPEED, 2.0);
         state.platforms.push(generatePlatform(rightMost, diff));
      }
      state.platforms = state.platforms.filter(p => p.x + p.width > state.cameraX - 1000);

      // 4. Game Over Check
      if (state.player.y > CANVAS_HEIGHT) {
        handleGameOver();
        // Don't return, keep drawing the death frame
      }

      // 5. Particles
      state.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
      });
      state.particles = state.particles.filter(p => p.life > 0);
    }

    // Draw
    const theme = THEMES.find(t => t.id === currentThemeId) || THEMES[0];
    const speedPhase = getSpeedMultiplier(state.tick);
    
    drawGame(
      ctx, 
      CANVAS_WIDTH, 
      CANVAS_HEIGHT, 
      state.player, 
      state.platforms, 
      state.particles, 
      state.bgElements,
      state.cameraX, 
      state.score,
      theme,
      speedPhase
    );

    requestRef.current = requestAnimationFrame(loop);
  }, [status, currentThemeId]); 

  const handleGameOver = () => {
    gameState.current.isRunning = false;
    audioManager.playGameOver();
    
    const finalScore = gameState.current.score;
    let newHigh = highScore;
    
    if (finalScore > highScore) {
      newHigh = finalScore;
      setHighScore(finalScore);
    }

    // Unlock Logic
    const newUnlocks = [...unlockedThemes];
    let changed = false;
    THEMES.forEach(t => {
      if (!newUnlocks.includes(t.id) && finalScore >= t.unlockScore) {
        newUnlocks.push(t.id);
        changed = true;
      }
    });
    
    if (changed) setUnlockedThemes(newUnlocks);
    
    // Save
    persistData(newHigh, newUnlocks);
    setStatus(GameStatus.GAME_OVER);
  };

  const handleThemeSelect = (id: string) => {
    setCurrentThemeId(id);
    const data: SaveData = {
      highScore,
      unlockedThemes,
      selectedThemeId: id,
      totalDistance: 0
    };
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);

  const currentTheme = THEMES.find(t => t.id === currentThemeId) || THEMES[0];

  // Calculate scroll offset for grid based on player position
  // Scale down the player X so the grid moves slower (parallax feel)
  const gridScrollOffset = gameState.current ? gameState.current.player.x * 0.005 : 0;

  return (
    <div className="relative w-full h-screen bg-black flex items-center justify-center overflow-hidden">
      
      {/* 3D Background Layer */}
      <div className="absolute inset-0 z-0 opacity-80">
        <GridScan 
           linesColor={currentTheme.bg === '#0f0f17' ? '#7C3AED' : currentTheme.accent}
           scanColor={currentTheme.primary}
           scrollOffset={gridScrollOffset}
        />
      </div>

      <div className="relative w-full h-full max-w-7xl max-h-[1080px] flex items-center justify-center shadow-2xl z-10">
        {/* Glow border based on current theme */}
        <div 
           className="absolute inset-0 pointer-events-none transition-all duration-1000 z-20"
           style={{
             boxShadow: `inset 0 0 100px ${currentTheme.primary}20`
           }}
        />

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-auto object-contain max-h-screen z-10"
          style={{ aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
        />
        
        <GameOverlay 
          status={status}
          score={score}
          highScore={highScore}
          currentThemeId={currentThemeId}
          unlockedThemes={unlockedThemes}
          onStart={initGame}
          onRestart={initGame}
          onSelectTheme={handleThemeSelect}
        />
      </div>
    </div>
  );
};

export default BounceRunner;
