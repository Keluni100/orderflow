import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Plus, History, TrendingUp, Settings } from 'lucide-react';

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
    // Geometric Brownian Motion with mean reversion
    const drift = (profile.basePrice - price) * 0.0001;
    const shock = (Math.random() - 0.5) * profile.volatility;
    price = price * (1 + drift + shock);

    // Volume clustering (more volume during moves)
    const priceChange = Math.abs(shock);
    const baseVolume = 5000 + Math.random() * 10000;
    const volumeMultiplier = 1 + priceChange * 50;
    const totalVolume = Math.floor(baseVolume * volumeMultiplier);

    // Realistic bid/ask imbalance based on price direction
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

// Generate price levels for footprint
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

  // Initialize data
  useEffect(() => {
    const newData = generateMarketData(instrument, 500);
    setData(newData);
    setCurrentIndex(50); // Start with some history visible
  }, [instrument]);

  // Load sessions
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const result = await window.storage.list('session:');
      if (result?.keys) {
        const loaded = await Promise.all(
          result.keys.map(async (key) => {
            const data = await window.storage.get(key);
            return data ? JSON.parse(data.value) : null;
          })
        );
        setSessions(loaded.filter(s => s).sort((a, b) => 
          new Date(b.startTime) - new Date(a.startTime)
        ));
      }
    } catch (err) {
      console.log('No previous sessions');
    }
  };

  const saveSession = async () => {
    if (currentSession.trades.length > 0) {
      try {
        await window.storage.set(
          `session:${currentSession.id}`,
          JSON.stringify(currentSession)
        );
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

  // Playback
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
    
    // Calculate P&L in account currency
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

  const handleNewSession = async () => {
    if (currentSession.trades.length > 0) {
      await saveSession();
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
    <div className="min-h-screen bg-black text-white p-3">
      <div className="max-w-[2000px] mx-auto">
        {/* Header */}
        <div className="mb-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold">Order Flow Simulator</h1>
              <p className="text-xs text-gray-500">Session #{currentSession.id}</p>
            </div>
            <select
              value={instrument}
              onChange={(e) => {
                setInstrument(e.target.value);
                setCurrentSession(prev => ({ ...prev, instrument: e.target.value }));
              }}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="EURUSD">EUR/USD</option>
              <option value="GBPUSD">GBP/USD</option>
              <option value="BTCUSD">BTC/USD</option>
              <option value="XAUUSD">XAU/USD (Gold)</option>
              <option value="NQ">NQ (Nasdaq)</option>
            </select>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm"
            >
              <Settings size={16} />
              Settings
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm"
            >
              <History size={16} />
              History
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          {/* Main Chart */}
          <div className="xl:col-span-4 space-y-3">
            {/* Controls */}
            <div className="bg-gray-900 rounded border border-gray-800 p-2 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-sm"
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={() => setCurrentIndex(50)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={handleNewSession}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-sm"
                >
                  <Plus size={14} />
                  New
                </button>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                >
                  <option value={2000}>0.5x</option>
                  <option value={1000}>1x</option>
                  <option value={500}>2x</option>
                  <option value={250}>4x</option>
                </select>
              </div>
              
              <div className="text-xs text-gray-400">
                Bar {currentIndex + 1} / {data.length}
              </div>
            </div>

            {/* Footprint Chart */}
            <div className="bg-gray-950 rounded border border-gray-800 overflow-hidden">
              <div className="bg-gray-900 px-3 py-1.5 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-xs font-semibold">Footprint Chart - {instrument}</h3>
                <div className="text-xs text-gray-400">
                  {currentBar && `Price: ${currentBar.close.toFixed(currentBar.profile.tickSize >= 1 ? 0 : 4)}`}
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <div className="flex" style={{ minWidth: 'max-content' }}>
                  {visibleBars.map((bar, barIdx) => {
                    const levels = generateFootprintLevels(bar);
                    const isCurrentBar = barIdx === visibleBars.length - 1;
                    
                    return (
                      <div key={barIdx} className={`flex-shrink-0 border-r border-gray-900 ${isCurrentBar ? 'bg-gray-900/50' : ''}`} style={{ width: '70px' }}>
                        <div className="px-1 py-0.5 text-[8px] text-center text-gray-600 border-b border-gray-900">
                          {bar.time.slice(11, 16)}
                        </div>
                        
                        <div>
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
                                className={`w-full px-0.5 py-0.5 text-[8px] font-mono border-b border-gray-950 transition-colors ${
                                  isCurrentBar ? 'hover:bg-gray-800 cursor-pointer' : 'cursor-default opacity-60'
                                } ${isPositiveDelta ? 'bg-green-950/30' : 'bg-red-950/30'}`}
                                style={{
                                  backgroundColor: isPositiveDelta 
                                    ? `rgba(34, 197, 94, ${0.1 + intensity * 0.3})`
                                    : `rgba(239, 68, 68, ${0.1 + intensity * 0.3})`
                                }}
                              >
                                <div className="flex justify-between gap-0.5">
                                  <span className="text-red-400 text-[7px]">{level.bidVolume}</span>
                                  <span className="text-white font-bold text-[8px]">
                                    {level.price.toFixed(bar.profile.tickSize >= 1 ? 0 : 4)}
                                  </span>
                                  <span className="text-green-400 text-[7px]">{level.askVolume}</span>
                                </div>
                                <div className={`text-center font-bold text-[8px] ${isPositiveDelta ? 'text-green-300' : 'text-red-300'}`}>
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
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => currentBar && executeTrade(currentBar.close, true, 0.1)}
                disabled={currentIndex >= data.length - 2}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded font-semibold transition-colors"
              >
                <TrendingUp size={20} />
                BUY 0.1 Lots
              </button>
              <button
                onClick={() => currentBar && executeTrade(currentBar.close, false, 0.1)}
                disabled={currentIndex >= data.length - 2}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-700 hover:bg-red-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded font-semibold transition-colors"
              >
                <TrendingUp size={20} className="rotate-180" />
                SELL 0.1 Lots
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Performance Grade */}
            <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded border border-blue-800 p-4 text-center">
              <div className="text-xs text-gray-400 mb-1">Performance Grade</div>
              <div className="text-5xl font-bold mb-2">{currentSession.grade}</div>
              <div className="text-xs text-gray-400">
                {currentSession.trades.length} trades minimum for grade
              </div>
            </div>

            {/* Stats */}
            <div className="bg-gray-900 rounded border border-gray-800 p-3">
              <h3 className="text-xs font-semibold mb-2 text-gray-400">SESSION STATS</h3>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">Win Rate</div>
                  <div className="text-2xl font-bold text-green-400">{currentSession.winRate}%</div>
                  <div className="text-[10px] text-gray-500">
                    {currentSession.trades.filter(t => t.isWin).length}W / {currentSession.trades.filter(t => !t.isWin).length}L
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">Total Trades</div>
                  <div className="text-xl font-bold">{currentSession.trades.length}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">Total P&L</div>
                  <div className={`text-xl font-bold ${currentSession.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {account.currency}{currentSession.totalPnL.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">Balance</div>
                  <div className="text-xl font-bold">{account.currency}{currentSession.balance.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="bg-gray-900 rounded border border-gray-800 p-3">
              <h3 className="text-xs font-semibold mb-2 text-gray-400">RECENT TRADES</h3>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {currentSession.trades.slice(-20).reverse().map((trade) => (
                  <div
                    key={trade.id}
                    className={`p-2 rounded text-[10px] border ${
                      trade.isWin ? 'bg-green-950/20 border-green-900' : 'bg-red-950/20 border-red-900'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-bold text-xs ${trade.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.type}
                      </span>
                      <span className={`font-bold text-xs ${trade.isWin ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.isWin ? 'WIN' : 'LOSS'}
                      </span>
                    </div>
                    <div className="text-[9px] text-gray-500 space-y-0.5">
                      <div>Entry: {trade.entryPrice.toFixed(4)}</div>
                      <div>Exit: {trade.exitPrice.toFixed(4)}</div>
                      <div className={trade.profit >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {account.currency}{trade.profit.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
                {currentSession.trades.length === 0 && (
                  <div className="text-center text-gray-600 py-8 text-[10px]">
                    Click price levels or use quick trade buttons
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Session History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded border border-gray-700 max-w-5xl w-full max-h-[85vh] overflow-hidden">
              <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                <h2 className="font-bold">Session History</h2>
                <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[calc(85vh-60px)]">
                {sessions.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">No sessions yet</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sessions.map((session) => (
                      <div key={session.id} className="bg-gray-800 rounded p-4 border border-gray-700">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="text-sm font-semibold">Session #{session.id}</div>
                            <div className="text-xs text-gray-400">{session.instrument}</div>
                            <div className="text-[10px] text-gray-500">{new Date(session.startTime).toLocaleString()}</div>
                          </div>
                          <div className={`text-3xl font-bold ${session.grade === 'A*' || session.grade === 'A' ? 'text-green-400' : session.grade === 'B' ? 'text-yellow-400' : 'text-red-400'}`}>
                            {session.grade}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <div className="text-gray-400 text-[10px]">Win Rate</div>
                            <div className="font-bold">{session.winRate}%</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-[10px]">Trades</div>
                            <div className="font-bold">{session.trades.length}</div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-[10px]">P&L</div>
                            <div className={`font-bold ${session.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded border border-gray-700 max-w-md w-full">
              <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                <h2 className="font-bold">Account Settings</h2>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Starting Balance</label>
                  <input
                    type="number"
                    value={account.balance}
                    onChange={(e) => setAccount(prev => ({ ...prev, balance: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Currency</label>
                  <select
                    value={account.currency}
                    onChange={(e) => setAccount(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                  >
                    <option value="£">GBP (£)</option>
                    <option value="$">USD ($)</option>
                    <option value="€">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Leverage</label>
                  <select
                    value={account.leverage}
                    onChange={(e) => setAccount(prev => ({ ...prev, leverage: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
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
        )}
      </div>
    </div>
  );
};

export default OrderFlowSimulator;