import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, History, TrendingUp, Settings } from 'lucide-react';
import './App.css';

// Realistic market data generator
const generateMarketData = (instrument, bars = 500) => {
  const profiles = {
    'EURUSD': { basePrice: 1.0850, volatility: 0.0003, spread: 0.00015, tickSize: 0.0001, lotSize: 100000 },
    'GBPUSD': { basePrice: 1.2650, volatility: 0.0004, spread: 0.0002, tickSize: 0.0001, lotSize: 100000 },
    'BTCUSD': { basePrice: 45000, volatility: 0.015, spread: 5, tickSize: 1, lotSize: 1 },
    'XAUUSD': { basePrice: 2050, volatility: 0.008, spread: 0.5, tickSize: 0.1, lotSize: 100 },
    'NQ': { basePrice: 16500, volatility: 0.005, spread: 0.25, tickSize: 0.25, lotSize: 20 }
  };

  const profile = profiles[instrument];
  const data = [];
  let price = profile.basePrice;
  let time = Date.now() - bars * 5 * 60000;

  for (let i = 0; i < bars; i++) {
    const drift = (profile.basePrice - price) * 0.0001;
    const shock = (Math.random() - 0.5) * profile.volatility;
    price = price * (1 + drift + shock);

    const priceChange = Math.abs(shock);
    const baseVolume = 5000 + Math.random() * 10000;
    const volumeMultiplier = 1 + priceChange * 50;
    const totalVolume = Math.floor(baseVolume * volumeMultiplier);

    const imbalance = shock > 0 ? 0.6 : 0.4;
    const bidVolume = Math.floor(totalVolume * imbalance);
    const askVolume = totalVolume - bidVolume;

    const high = price + profile.spread + Math.random() * profile.volatility * price;
    const low = price - profile.spread - Math.random() * profile.volatility * price;
    const open = low + Math.random() * (high - low);
    const close = low + Math.random() * (high - low);

    data.push({
      time: new Date(time).toISOString(),
      timestamp: time,
      open: parseFloat(open.toFixed(profile.tickSize >= 1 ? 0 : 4)),
      high: parseFloat(high.toFixed(profile.tickSize >= 1 ? 0 : 4)),
      low: parseFloat(low.toFixed(profile.tickSize >= 1 ? 0 : 4)),
      close: parseFloat(close.toFixed(profile.tickSize >= 1 ? 0 : 4)),
      volume: totalVolume,
      bidVolume,
      askVolume,
      profile
    });

    time += 5 * 60000;
  }

  return data;
};

const generateFootprintLevels = (bar) => {
  if (!bar) return [];
  
  const tickSize = bar.profile.tickSize;
  const range = bar.high - bar.low;
  const numLevels = Math.max(5, Math.round(range / tickSize));
  const levels = [];

  for (let i = 0; i < numLevels; i++) {
    const price = bar.low + (i / numLevels) * range;
    const distanceFromClose = Math.abs(price - bar.close);
    const weight = Math.exp(-distanceFromClose / (range * 0.3));
    
    const bidVol = Math.floor((bar.bidVolume / numLevels) * weight * (0.3 + Math.random() * 1.4));
    const askVol = Math.floor((bar.askVolume / numLevels) * weight * (0.3 + Math.random() * 1.4));
    
    levels.push({
      price: parseFloat(price.toFixed(tickSize >= 1 ? 0 : 4)),
      bidVolume: bidVol,
      askVolume: askVol,
      delta: askVol - bidVol,
      totalVolume: bidVol + askVol
    });
  }

  return levels.reverse();
};

const OrderFlowSimulator = () => {
  const [instrument, setInstrument] = useState('EURUSD');
  const [data, setData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  
  const [account, setAccount] = useState({
    balance: 10000,
    currency: '£',
    leverage: 100
  });

  const [currentSession, setCurrentSession] = useState({
    id: Date.now(),
    startTime: new Date().toISOString(),
    instrument: 'EURUSD',
    trades: [],
    balance: 10000,
    winRate: 0,
    totalPnL: 0,
    grade: 'N/A'
  });

  const [sessions, setSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const playInterval = useRef(null);

  useEffect(() => {
    const newData = generateMarketData(instrument, 500);
    setData(newData);
    setCurrentIndex(50);
  }, [instrument]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = () => {
    try {
      const stored = localStorage.getItem('trading-sessions');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSessions(parsed.sort((a, b) => 
          new Date(b.startTime) - new Date(a.startTime)
        ));
      }
    } catch (err) {
      console.log('No previous sessions');
    }
  };

  const saveSession = () => {
    if (currentSession.trades.length > 0) {
      try {
        const stored = localStorage.getItem('trading-sessions');
        const existingSessions = stored ? JSON.parse(stored) : [];
        
        const sessionIndex = existingSessions.findIndex(s => s.id === currentSession.id);
        if (sessionIndex >= 0) {
          existingSessions[sessionIndex] = currentSession;
        } else {
          existingSessions.push(currentSession);
        }
        
        localStorage.setItem('trading-sessions', JSON.stringify(existingSessions));
        
        setSessions(existingSessions.sort((a, b) => 
          new Date(b.startTime) - new Date(a.startTime)
        ));
      } catch (err) {
        console.error('Save failed:', err);
      }
    }
  };

  useEffect(() => {
    if (currentSession.trades.length > 0) {
      saveSession();
    }
  }, [currentSession]);

  useEffect(() => {
    if (isPlaying && currentIndex < data.length - 1) {
      playInterval.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= data.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      if (playInterval.current) clearInterval(playInterval.current);
    }
    return () => {
      if (playInterval.current) clearInterval(playInterval.current);
    };
  }, [isPlaying, currentIndex, data.length, playbackSpeed]);

  const calculateGrade = (winRate, trades) => {
    if (trades < 10) return 'N/A';
    if (winRate >= 75) return 'A*';
    if (winRate >= 65) return 'A';
    if (winRate >= 55) return 'B';
    if (winRate >= 45) return 'C';
    if (winRate >= 35) return 'D';
    return 'F';
  };

  const executeTrade = (price, isBuy, lots = 0.1) => {
    if (currentIndex >= data.length - 2) return;

    const entryBar = data[currentIndex];
    const exitBar = data[currentIndex + 1];
    const profile = entryBar.profile;

    const entryPrice = price;
    const exitPrice = exitBar.close;
    const contractSize = profile.lotSize * lots;
    
    const priceDiff = isBuy ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
    const profit = priceDiff * contractSize;
    const profitInCurrency = instrument.includes('USD') && account.currency === '£' 
      ? profit * 0.79 
      : profit;

    const isWin = profit > 0;

    const trade = {
      id: Date.now(),
      type: isBuy ? 'BUY' : 'SELL',
      entryPrice,
      entryTime: entryBar.time,
      entryIndex: currentIndex,
      exitPrice,
      exitTime: exitBar.time,
      lots,
      contractSize,
      profit: profitInCurrency,
      isWin,
      instrument
    };

    const updatedTrades = [...currentSession.trades, trade];
    const wins = updatedTrades.filter(t => t.isWin).length;
    const winRate = (wins / updatedTrades.length * 100).toFixed(1);
    const totalPnL = updatedTrades.reduce((sum, t) => sum + t.profit, 0);
    const grade = calculateGrade(parseFloat(winRate), updatedTrades.length);

    setCurrentSession(prev => ({
      ...prev,
      trades: updatedTrades,
      winRate: parseFloat(winRate),
      totalPnL,
      grade,
      balance: account.balance + totalPnL
    }));
  };

  const handleNewSession = () => {
    if (currentSession.trades.length > 0) {
      saveSession();
      setSessions(prev => [currentSession, ...prev]);
    }

    const newData = generateMarketData(instrument, 500);
    setData(newData);
    setCurrentIndex(50);
    
    setCurrentSession({
      id: Date.now(),
      startTime: new Date().toISOString(),
      instrument,
      trades: [],
      balance: account.balance,
      winRate: 0,
      totalPnL: 0,
      grade: 'N/A'
    });
    
    setIsPlaying(false);
  };

  const visibleBars = data.slice(Math.max(0, currentIndex - 25), currentIndex + 1);
  const currentBar = data[currentIndex];

  return (
    <div className="app-container">
      <div className="app-wrapper">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div>
              <h1 className="title">Order Flow Simulator</h1>
              <p className="session-id">Session #{currentSession.id}</p>
            </div>
            <select
              value={instrument}
              onChange={(e) => {
                setInstrument(e.target.value);
                setCurrentSession(prev => ({ ...prev, instrument: e.target.value }));
              }}
              className="instrument-select"
            >
              <option value="EURUSD">EUR/USD</option>
              <option value="GBPUSD">GBP/USD</option>
              <option value="BTCUSD">BTC/USD</option>
              <option value="XAUUSD">XAU/USD (Gold)</option>
              <option value="NQ">NQ (Nasdaq)</option>
            </select>
          </div>
          
          <div className="header-right">
            <button onClick={() => setShowSettings(!showSettings)} className="header-btn">
              <Settings size={16} />
              Settings
            </button>
            <button onClick={() => setShowHistory(!showHistory)} className="header-btn">
              <History size={16} />
              History
            </button>
          </div>
        </div>

        <div className="main-grid">
          <div className="chart-section">
            {/* Controls */}
            <div className="controls">
              <div className="controls-left">
                <button onClick={() => setIsPlaying(!isPlaying)} className="btn-play">
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button onClick={() => setCurrentIndex(50)} className="btn-reset">
                  <RotateCcw size={14} />
                </button>
                <button onClick={handleNewSession} className="btn-new">
                  <Plus size={14} />
                  New
                </button>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="speed-select"
                >
                  <option value={2000}>0.5x</option>
                  <option value={1000}>1x</option>
                  <option value={500}>2x</option>
                  <option value={250}>4x</option>
                </select>
              </div>
              
              <div className="bar-counter">
                Bar {currentIndex + 1} / {data.length}
              </div>
            </div>

            {/* Footprint Chart */}
            <div className="footprint-chart">
              <div className="footprint-header">
                <h3>Footprint Chart - {instrument}</h3>
                <div className="current-price">
                  {currentBar && `Price: ${currentBar.close.toFixed(currentBar.profile.tickSize >= 1 ? 0 : 4)}`}
                </div>
              </div>
              
              <div className="footprint-scroll">
                <div className="footprint-bars">
                  {visibleBars.map((bar, barIdx) => {
                    const levels = generateFootprintLevels(bar);
                    const isCurrentBar = barIdx === visibleBars.length - 1;
                    
                    return (
                      <div key={barIdx} className={`bar-column ${isCurrentBar ? 'current' : ''}`}>
                        <div className="bar-time">{bar.time.slice(11, 16)}</div>
                        
                        <div className="bar-levels">
                          {levels.map((level, levelIdx) => {
                            const deltaRatio = level.delta / (level.totalVolume || 1);
                            const isPositiveDelta = level.delta > 0;
                            const intensity = Math.abs(deltaRatio);
                            
                            return (
                              <button
                                key={levelIdx}
                                onClick={() => {
                                  if (isCurrentBar) {
                                    executeTrade(level.price, isPositiveDelta, 0.1);
                                  }
                                }}
                                disabled={!isCurrentBar}
                                className={`level-btn ${isPositiveDelta ? 'positive' : 'negative'} ${!isCurrentBar ? 'disabled' : ''}`}
                                style={{
                                  backgroundColor: isPositiveDelta 
                                    ? `rgba(34, 197, 94, ${0.1 + intensity * 0.3})`
                                    : `rgba(239, 68, 68, ${0.1 + intensity * 0.3})`
                                }}
                              >
                                <div className="level-volumes">
                                  <span className="bid-vol">{level.bidVolume}</span>
                                  <span className="price-label">
                                    {level.price.toFixed(bar.profile.tickSize >= 1 ? 0 : 4)}
                                  </span>
                                  <span className="ask-vol">{level.askVolume}</span>
                                </div>
                                <div className={`delta ${isPositiveDelta ? 'delta-positive' : 'delta-negative'}`}>
                                  {level.delta > 0 ? '+' : ''}{level.delta}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Trade Buttons */}
            <div className="trade-buttons">
              <button
                onClick={() => currentBar && executeTrade(currentBar.close, true, 0.1)}
                disabled={currentIndex >= data.length - 2}
                className="btn-buy"
              >
                <TrendingUp size={20} />
                BUY 0.1 Lots
              </button>
              <button
                onClick={() => currentBar && executeTrade(currentBar.close, false, 0.1)}
                disabled={currentIndex >= data.length - 2}
                className="btn-sell"
              >
                <TrendingUp size={20} className="rotate-180" />
                SELL 0.1 Lots
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            {/* Performance Grade */}
            <div className="grade-card">
              <div className="grade-label">Performance Grade</div>
              <div className="grade-value">{currentSession.grade}</div>
              <div className="grade-note">
                {currentSession.trades.length} trades minimum for grade
              </div>
            </div>

            {/* Stats */}
            <div className="stats-card">
              <h3 className="card-title">SESSION STATS</h3>
              <div className="stats-grid">
                <div className="stat">
                  <div className="stat-label">Win Rate</div>
                  <div className="stat-value win-rate">{currentSession.winRate}%</div>
                  <div className="stat-note">
                    {currentSession.trades.filter(t => t.isWin).length}W / {currentSession.trades.filter(t => !t.isWin).length}L
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total Trades</div>
                  <div className="stat-value">{currentSession.trades.length}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total P&L</div>
                  <div className={`stat-value ${currentSession.totalPnL >= 0 ? 'positive' : 'negative'}`}>
                    {account.currency}{currentSession.totalPnL.toFixed(2)}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Balance</div>
                  <div className="stat-value">{account.currency}{currentSession.balance.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="trades-card">
              <h3 className="card-title">RECENT TRADES</h3>
              <div className="trades-list">
                {currentSession.trades.slice(-20).reverse().map((trade) => (
                  <div key={trade.id} className={`trade-item ${trade.isWin ? 'win' : 'loss'}`}>
                    <div className="trade-header">
                      <span className={`trade-type ${trade.type.toLowerCase()}`}>{trade.type}</span>
                      <span className={`trade-result ${trade.isWin ? 'win' : 'loss'}`}>
                        {trade.isWin ? 'WIN' : 'LOSS'}
                      </span>
                    </div>
                    <div className="trade-details">
                      <div>Entry: {trade.entryPrice.toFixed(4)}</div>
                      <div>Exit: {trade.exitPrice.toFixed(4)}</div>
                      <div className={`trade-profit ${trade.profit >= 0 ? 'positive' : 'negative'}`}>
                        {account.currency}{trade.profit.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
                {currentSession.trades.length === 0 && (
                  <div className="no-trades">
                    Click price levels or use quick trade buttons
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Session History Modal */}
        {showHistory && (
          <div className="modal-overlay" onClick={() => setShowHistory(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Session History</h2>
                <button onClick={() => setShowHistory(false)} className="modal-close">✕</button>
              </div>
              <div className="modal-content">
                {sessions.length === 0 ? (
                  <div className="no-sessions">No sessions yet</div>
                ) : (
                  <div className="sessions-grid">
                    {sessions.map((session) => (
                      <div key={session.id} className="session-card">
                        <div className="session-header">
                          <div>
                            <div className="session-title">Session #{session.id}</div>
                            <div className="session-instrument">{session.instrument}</div>
                            <div className="session-date">{new Date(session.startTime).toLocaleString()}</div>
                          </div>
                          <div className={`session-grade grade-${session.grade.toLowerCase()}`}>
                            {session.grade}
                          </div>
                        </div>
                        <div className="session-stats">
                          <div>
                            <div className="session-stat-label">Win Rate</div>
                            <div className="session-stat-value">{session.winRate}%</div>
                          </div>
                          <div>
                            <div className="session-stat-label">Trades</div>
                            <div className="session-stat-value">{session.trades.length}</div>
                          </div>
                          <div>
                            <div className="session-stat-label">P&L</div>
                            <div className={`session-stat-value ${session.totalPnL >= 0 ? 'positive' : 'negative'}`}>
                              £{session.totalPnL.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Account Settings</h2>
                <button onClick={() => setShowSettings(false)} className="modal-close">✕</button>
              </div>
              <div className="modal-content">
                <div className="settings-form">
                  <div className="form-group">
                    <label>Starting Balance</label>
                    <input
                      type="number"
                      value={account.balance}
                      onChange={(e) => setAccount(prev => ({ ...prev, balance: Number(e.target.value) }))}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Currency</label>
                    <select
                      value={account.currency}
                      onChange={(e) => setAccount(prev => ({ ...prev, currency: e.target.value }))}
                      className="form-select"
                    >
                      <option value="£">GBP (£)</option>
                      <option value="$">USD ($)</option>
                      <option value="€">EUR (€)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Leverage</label>
                    <select
                      value={account.leverage}
                      onChange={(e) => setAccount(prev => ({ ...prev, leverage: Number(e.target.value) }))}
                      className="form-select"
                    >
                      <option value={50}>1:50</option>
                      <option value={100}>1:100</option>
                      <option value={200}>1:200</option>
                      <option value={500}>1:500</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderFlowSimulator;