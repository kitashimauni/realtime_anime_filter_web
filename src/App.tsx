import { useEffect, useRef, useState } from 'react';

type VideoDevice = MediaDeviceInfo;

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });
  const [displaySize, setDisplaySize] = useState({ width: 640, height: 480 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showOrientationHint, setShowOrientationHint] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isHTTPS, setIsHTTPS] = useState(false);

  useEffect(() => {
    console.log('OpenCV初期化開始');
    
    // HTTPS接続の確認
    setIsHTTPS(location.protocol === 'https:' || location.hostname === 'localhost');
    
    // OpenCVの初期化を待つ関数
    const waitForOpenCV = () => {
      if ((window as any).cv && (window as any).cv.Mat && (window as any).cv.imread) {
        console.log('OpenCV.js は準備完了しました！');
        setCvReady(true);
      } else {
        console.log('OpenCVを待機中...');
        setTimeout(waitForOpenCV, 100);
      }
    };
    
    waitForOpenCV();
  }, []);

  // モバイル検出とリサイズハンドラー
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 画面の向きの変更を監視
  useEffect(() => {
    if (!isMobile) return;

    const handleOrientationChange = () => {
      console.log('画面の向きが変更されました:', window.innerWidth, 'x', window.innerHeight);
      
      // 全画面時に縦向きになった場合の警告表示
      if (isFullscreen && window.innerHeight > window.innerWidth) {
        console.log('横向きでの使用を推奨します');
        setShowOrientationHint(true);
        // 3秒後に非表示
        setTimeout(() => setShowOrientationHint(false), 3000);
      } else {
        setShowOrientationHint(false);
      }
    };

    // orientationchange イベントは非推奨になりつつあるため、resize で代用
    window.addEventListener('resize', handleOrientationChange);
    
    // Screen Orientation API が利用可能な場合
    if ('orientation' in screen && 'addEventListener' in screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange);
      
      return () => {
        window.removeEventListener('resize', handleOrientationChange);
        screen.orientation.removeEventListener('change', handleOrientationChange);
      };
    }

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, [isMobile, isFullscreen]);


  // 初期化（カメラ許可 & デバイス取得）
  useEffect(() => {
    const init = async () => {
      try {
        console.log('カメラ初期化を開始します...');
        
        // まず基本的なカメラアクセス権限を取得
        console.log('カメラアクセス権限を要求中...');
        const initialStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user' // フロントカメラを優先
          } 
        });
        
        // 権限取得後、すぐにストリームを停止
        initialStream.getTracks().forEach(track => track.stop());
        console.log('初期権限取得完了、ストリームを停止しました');

        // 権限取得後にデバイス一覧を取得
        if (!navigator.mediaDevices?.enumerateDevices) {
          console.error("enumerateDevices() はサポートされていません");
          return;
        }

        const deviceInfos = await navigator.mediaDevices.enumerateDevices();
        console.log('検出されたすべてのデバイス:', deviceInfos);
        
        const videoDevices = deviceInfos.filter((d) => d.kind === 'videoinput');
        console.log('ビデオデバイス:', videoDevices);
        
        if (videoDevices.length === 0) {
          console.error('ビデオデバイスが見つかりません');
          return;
        }

        setDevices(videoDevices);

        // スマートフォンの場合、より適切なデフォルトカメラを選択
        let defaultDeviceId = videoDevices[0].deviceId;
        
        // フロントカメラを探す（スマートフォンの場合）
        if (isMobile) {
          const frontCamera = videoDevices.find(device => 
            device.label.toLowerCase().includes('front') || 
            device.label.toLowerCase().includes('user') ||
            device.label.toLowerCase().includes('facing')
          );
          if (frontCamera) {
            defaultDeviceId = frontCamera.deviceId;
            console.log('フロントカメラを選択しました:', frontCamera.label);
          }
        }

        setSelectedDeviceId(defaultDeviceId);
        console.log('選択されたデバイスID:', defaultDeviceId);

      } catch (error) {
        console.error('カメラ初期化エラー:', error);
        
        // エラーの詳細を表示
        if (error instanceof Error) {
          console.error('エラーの詳細:', {
            name: error.name,
            message: error.message,
            isHTTPS: location.protocol === 'https:',
            userAgent: navigator.userAgent
          });
          
          // エラー状態をUIに反映
          setCameraError(`カメラアクセスエラー: ${error.message}`);
        }

        // HTTPSでない場合の警告
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
          console.error('HTTPS接続が必要です。カメラアクセスにはセキュアな接続が必要です。');
          setCameraError('HTTPS接続が必要です。カメラアクセスにはセキュアな接続が必要です。');
        }
      }
    };
    
    init();
  }, [isMobile]);

  // カメラ切替処理
  useEffect(() => {
    const startStream = async () => {
      if (!selectedDeviceId) {
        console.log('デバイスIDが選択されていません');
        return;
      }

      console.log('カメラストリーム開始:', selectedDeviceId);

      // 既存のストリームを停止
      if (stream) {
        console.log('既存のストリームを停止中...');
        stream.getTracks().forEach((track) => track.stop());
      }

      try {
        // スマートフォン向けの制約を設定
        const constraints = {
          video: { 
            deviceId: { exact: selectedDeviceId },
            width: { ideal: isMobile ? 1280 : 1920 },
            height: { ideal: isMobile ? 720 : 1080 },
            // スマートフォンでの追加設定
            ...(isMobile && {
              facingMode: 'user', // フロントカメラを推奨
              frameRate: { ideal: 30, max: 60 }
            })
          },
          audio: false // 音声は不要なので明示的に無効化
        };

        console.log('カメラ制約:', constraints);

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('新しいストリーム取得成功');

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          
          // videoの読み込み完了イベントを待ち受ける
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              console.log('ビデオメタデータ読み込み完了');
              
              // モバイルでの自動再生を確実にする
              videoRef.current.play().catch((playError) => {
                console.error('自動再生に失敗:', playError);
                // 自動再生に失敗した場合の対処
                console.log('手動再生が必要な可能性があります');
              });
              
              const width = videoRef.current.videoWidth;
              const height = videoRef.current.videoHeight;
              
              console.log(`実際のビデオ解像度: ${width}x${height}`);
              
              // 内部解像度とキャンバスサイズを設定
              setVideoSize({ width, height });
              
              // 表示サイズを設定（画面サイズに合わせて縮小）
              let maxWidth, scale;
              if (isFullscreen && isMobile) {
                // 全画面時は画面全体を使用
                maxWidth = window.innerWidth;
                const heightScale = window.innerHeight / height;
                const widthScale = window.innerWidth / width;
                scale = Math.min(heightScale, widthScale);
              } else {
                maxWidth = isMobile ? window.innerWidth * 0.95 : Math.min(width, window.innerWidth * 0.9);
                scale = maxWidth / width;
              }
              
              setDisplaySize({
                width: Math.floor(width * scale),
                height: Math.floor(height * scale)
              });
              
              console.log(`表示サイズ: ${Math.floor(width * scale)}x${Math.floor(height * scale)}`);
              
              // canvasのサイズを設定
              if (canvasRef.current) {
                canvasRef.current.width = width;
                canvasRef.current.height = height;
                console.log('キャンバスサイズを設定しました');
              }
            }
          };

          // エラーハンドリング
          videoRef.current.onerror = (error) => {
            console.error('ビデオ要素エラー:', error);
          };
        }

        setStream(newStream);
        console.log('ストリーム設定完了');
        
        // 成功した場合はエラー状態をクリア
        setCameraError(null);

      } catch (error) {
        console.error('カメラの起動に失敗しました:', error);
        
        // 詳細なエラー情報
        if (error instanceof Error) {
          console.error('エラー詳細:', {
            name: error.name,
            message: error.message,
            selectedDeviceId,
            isMobile,
            isHTTPS: location.protocol === 'https:'
          });
          
          setCameraError(`カメラ起動エラー: ${error.message}`);
        }

        // フォールバック: デバイスIDを指定せずに再試行
        if (selectedDeviceId) {
          console.log('フォールバック: デバイスIDなしで再試行...');
          try {
            const fallbackConstraints = {
              video: {
                width: { ideal: isMobile ? 1280 : 1920 },
                height: { ideal: isMobile ? 720 : 1080 },
                facingMode: isMobile ? 'user' : 'environment'
              },
              audio: false
            };
            
            const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            
            if (videoRef.current) {
              videoRef.current.srcObject = fallbackStream;
            }
            
            setStream(fallbackStream);
            console.log('フォールバックストリーム取得成功');
            setCameraError(null); // 成功したらエラーをクリア
            
          } catch (fallbackError) {
            console.error('フォールバックも失敗:', fallbackError);
          }
        }
      }
    };

    startStream();
  }, [selectedDeviceId, isMobile, isFullscreen]);

  // フィルター処理
  useEffect(() => {
    console.log('フィルター処理useEffect開始', { cvReady, stream: !!stream });
    
    if (!cvReady) {
      console.log('OpenCVが準備できていません');
      return;
    }
    
    if (!stream) {
      console.log('ストリームが準備できていません');
      return;
    }
    
    console.log('フィルター処理を開始します');
    
    let requestId: number;
    let frameCount = 0;

    const draw = () => {
      if (!videoRef.current || !canvasRef.current) {
        requestId = requestAnimationFrame(draw);
        return;
      }

      if (videoRef.current.readyState < 2) {
        requestId = requestAnimationFrame(draw);
        return;
      }

      frameCount++;
      if (frameCount === 1) {
        console.log('最初のフレーム処理を開始');
      }
      if (frameCount % 30 === 0) {
        console.log(`フィルター処理実行中 - フレーム ${frameCount}`);
      }
      
      try {
        const width = videoRef.current.videoWidth;
        const height = videoRef.current.videoHeight;
        
        if (width === 0 || height === 0) {
          requestId = requestAnimationFrame(draw);
          return;
        }
        
        // キャンバスの内部サイズが異なる場合は更新
        if (canvasRef.current.width !== width || canvasRef.current.height !== height) {
          console.log(`キャンバスサイズを更新: ${width}x${height}`);
          canvasRef.current.width = width;
          canvasRef.current.height = height;
        }

        // OpenCVフィルター処理 - Canvas2Dを使用してビデオフレームを取得
        const canvas2d = document.createElement('canvas');
        canvas2d.width = width;
        canvas2d.height = height;
        const ctx = canvas2d.getContext('2d');
        if (!ctx) {
          requestId = requestAnimationFrame(draw);
          return;
        }
        
        // ビデオフレームをcanvasに描画
        ctx.drawImage(videoRef.current, 0, 0, width, height);
        
        // canvasからImageDataを取得してMatに変換
        const imageData = ctx.getImageData(0, 0, width, height);
        const src = cv.matFromImageData(imageData);
        
        // 読み取ったMatが空でないことを確認
        if (src.empty()) {
          console.log('ビデオフレームが空です');
          src.delete();
          requestId = requestAnimationFrame(draw);
          return;
        }
        
        // アニメ風フィルター処理を適用
        const result = cartoonizeImage(src);
        cv.imshow(canvasRef.current, result);

        // メモリ解放
        src.delete();
        result.delete();
      } catch (error) {
        console.error('フィルター処理エラー:', error);
      }

      requestId = requestAnimationFrame(draw);
    };

    // アニメ風フィルター処理関数
    function cartoonizeImage(img: any) {
      try {
        console.log('cartoonizeImage開始 - 入力画像サイズ:', img.rows, 'x', img.cols, '型:', img.type());
        
        // 入力画像の型をCV_8UC4に変換
        const imgRGB = new cv.Mat();
        if (img.type() !== cv.CV_8UC3) {
          console.log('色空間変換を実行');
          cv.cvtColor(img, imgRGB, cv.COLOR_RGBA2RGB);
        } else {
          console.log('既にRGB形式');
          img.copyTo(imgRGB);
        }
        
        console.log('ステップ1: バイラテラルフィルター開始');
        // ステップ1: バイラテラルフィルターで画像の平滑化
        const imgColor = new cv.Mat();
        cv.bilateralFilter(imgRGB, imgColor, 7, 75, 75);
        console.log('ステップ1完了');
        
        console.log('ステップ2: グレースケール変換開始');
        // ステップ2: グレースケール化とメディアンブラー
        const imgGray = new cv.Mat();
        cv.cvtColor(imgRGB, imgGray, cv.COLOR_RGBA2GRAY);
        console.log('ステップ2-1完了');
        
        const imgBlur = new cv.Mat();
        cv.medianBlur(imgGray, imgBlur, 5);
        console.log('ステップ2完了');
        
        console.log('ステップ3: エッジ検出開始');
        // ステップ3: エッジ検出（適応的閾値処理）
        const imgEdge = new cv.Mat();
        cv.adaptiveThreshold(
          imgBlur,
          imgEdge,
          255,
          cv.ADAPTIVE_THRESH_MEAN_C,
          cv.THRESH_BINARY,
          9,  // blockSize
          2   // C値
        );
        console.log('ステップ3完了');
        
        console.log('ステップ4: エッジ画像色変換開始');
        // ステップ4: エッジ画像をRGBAに変換
        const imgEdgeColor = new cv.Mat();
        cv.cvtColor(imgEdge, imgEdgeColor, cv.COLOR_GRAY2RGB);
        console.log('ステップ4完了');
        
        console.log('ステップ5: 画像合成開始');
        // ステップ5: カラー画像とエッジ画像を合成
        const cartoon = new cv.Mat();
        cv.bitwise_and(imgColor, imgEdgeColor, cartoon);
        console.log('ステップ5完了');
        
        // 中間画像のメモリ解放
        imgRGB.delete();
        imgColor.delete();
        imgGray.delete();
        imgBlur.delete();
        imgEdge.delete();
        imgEdgeColor.delete();
        
        console.log('cartoonizeImage完了');
        return cartoon;
      } catch (error: any) {
        console.error('cartoonizeImageエラー:', error);
        console.error('エラー詳細:', error.toString());
        // エラーの場合は元の画像を返す
        const result = new cv.Mat();
        img.copyTo(result);
        return result;
      }
    }

    console.log('アニメーションフレーム開始');
    requestId = requestAnimationFrame(draw);
    
    return () => {
      console.log('フィルター処理クリーンアップ');
      cancelAnimationFrame(requestId);
    };
  }, [cvReady, selectedDeviceId, stream]);

  // ウィンドウリサイズ時の表示サイズ調整
  useEffect(() => {
    const handleResize = () => {
      if (videoRef.current) {
        const width = videoRef.current.videoWidth;
        if (width) {
          let maxWidth, scale;
          if (isFullscreen && isMobile) {
            // 全画面時は画面全体を使用
            maxWidth = window.innerWidth;
            const heightScale = window.innerHeight / videoRef.current.videoHeight;
            const widthScale = window.innerWidth / width;
            scale = Math.min(heightScale, widthScale);
          } else {
            maxWidth = isMobile ? window.innerWidth * 0.95 : Math.min(width, window.innerWidth * 0.9);
            scale = maxWidth / width;
          }
          
          setDisplaySize({
            width: Math.floor(width * scale),
            height: Math.floor(videoRef.current.videoHeight * scale)
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, isFullscreen]);

  // 全画面表示のトグル関数
  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      // 全画面に入る
      try {
        await document.documentElement.requestFullscreen();
        
        // モバイルデバイスの場合、横向きに回転を要求
        if (isMobile && 'orientation' in screen && 'lock' in screen.orientation) {
          try {
            await (screen.orientation as any).lock('landscape');
            console.log('画面を横向きにロックしました');
          } catch (orientationError) {
            console.log('画面の向きロックに失敗しました:', orientationError);
            // 向きロックに失敗してもアプリは続行
          }
        }
        
        setIsFullscreen(true);
      } catch (error) {
        console.error('全画面表示に失敗しました:', error);
      }
    } else {
      // 全画面を終了
      try {
        // 画面の向きロックを解除
        if (isMobile && 'orientation' in screen && 'unlock' in screen.orientation) {
          try {
            (screen.orientation as any).unlock();
            console.log('画面の向きロックを解除しました');
          } catch (orientationError) {
            console.log('画面の向きロック解除に失敗しました:', orientationError);
          }
        }
        
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (error) {
        console.error('全画面終了に失敗しました:', error);
      }
    }
  };

  // 全画面状態の変更を監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      
      // 全画面を終了した時に画面の向きロックも解除
      if (!isCurrentlyFullscreen && isMobile && 'orientation' in screen && 'unlock' in screen.orientation) {
        try {
          (screen.orientation as any).unlock();
          console.log('全画面終了時に画面の向きロックを解除しました');
        } catch (error) {
          console.log('画面の向きロック解除に失敗しました:', error);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isMobile]);

  // 全画面時のコントロール自動非表示
  useEffect(() => {
    if (!isFullscreen) return;

    let timeoutId: number;
    
    const resetTimeout = () => {
      setShowControls(true);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setShowControls(false), 3000);
    };

    const handleUserActivity = () => resetTimeout();

    // 初回タイマー設定
    resetTimeout();

    // ユーザーアクティビティの監視
    document.addEventListener('mousemove', handleUserActivity);
    document.addEventListener('touchstart', handleUserActivity);
    document.addEventListener('keydown', handleUserActivity);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousemove', handleUserActivity);
      document.removeEventListener('touchstart', handleUserActivity);
      document.removeEventListener('keydown', handleUserActivity);
    };
  }, [isFullscreen]);

  // スクリーンショット機能
  const takeScreenshot = () => {
    if (!canvasRef.current) return;
    
    const link = document.createElement('a');
    link.download = `anime-filter-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  // カメラ切り替え（フロント/リア）
  const switchCamera = async () => {
    if (devices.length <= 1) return;
    
    const currentIndex = devices.findIndex(device => device.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    setSelectedDeviceId(devices[nextIndex].deviceId);
  };

  return (
    <div 
      style={{ 
        width: isFullscreen ? '100vw' : '100%', 
        height: isFullscreen ? '100vh' : 'auto',
        maxWidth: isFullscreen ? 'none' : '1200px', 
        margin: isFullscreen ? '0' : '0 auto', 
        padding: isFullscreen ? '0' : (isMobile ? '10px' : '0 20px'),
        backgroundColor: isFullscreen ? '#000' : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isFullscreen ? 'center' : 'flex-start'
      }}
    >
      {!isFullscreen && (
        <>
          <h1 style={{ fontSize: isMobile ? '1.5rem' : '2rem', margin: isMobile ? '10px 0' : '20px 0' }}>
            アニメ風フィルター（カメラ選択対応）
          </h1>

          <label style={{ fontSize: isMobile ? '0.9rem' : '1rem', marginBottom: '10px' }}>
            カメラ選択：
            <select
              value={selectedDeviceId ?? ''}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              style={{ 
                marginLeft: '10px', 
                padding: isMobile ? '8px' : '5px',
                fontSize: isMobile ? '0.9rem' : '1rem'
              }}
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `カメラ (${device.deviceId.slice(0, 4)})`}
                </option>
              ))}
            </select>
          </label>
          
          <div style={{ marginTop: '10px', fontSize: isMobile ? '0.8rem' : '1rem' }}>
            <p>OpenCV準備状態: {cvReady ? '✅ 準備完了' : '❌ 準備中...'}</p>
            <p>接続状態: {isHTTPS ? '🔒 HTTPS' : '⚠️ HTTP (カメラアクセス制限あり)'}</p>
            <p>カメラ解像度: {videoSize.width}x{videoSize.height}</p>
            <p>表示サイズ: {displaySize.width}x{displaySize.height}</p>
            <p>デバイス: {isMobile ? '📱 モバイル' : '🖥️ デスクトップ'}</p>
            <p>検出カメラ数: {devices.length}台</p>
            
            {/* エラー表示 */}
            {cameraError && (
              <div style={{
                background: '#ff4444',
                color: 'white',
                padding: '10px',
                borderRadius: '5px',
                margin: '10px 0',
                fontSize: '0.9rem'
              }}>
                ⚠️ {cameraError}
                {!isHTTPS && (
                  <div style={{ marginTop: '5px', fontSize: '0.8rem' }}>
                    解決方法: HTTPS接続でアクセスするか、localhost環境を使用してください
                  </div>
                )}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
              <button 
                onClick={() => {
                  const cvStatus = {
                    cvReady,
                    stream: !!stream,
                    openCvExists: typeof (window as any).cv !== 'undefined'
                  };
                  console.log('OpenCV状態確認:', cvStatus);
                  
                  // OpenCVが読み込まれているのにcvReadyがfalseの場合は強制更新
                  if (!cvReady && typeof (window as any).cv !== 'undefined') {
                    console.log('OpenCVを強制的に準備完了に設定');
                    setCvReady(true);
                  }
                }}
                style={{ 
                  padding: isMobile ? '8px 16px' : '5px 10px',
                  fontSize: isMobile ? '0.9rem' : '1rem'
                }}
              >
                OpenCV状態確認
              </button>
              
              {/* カメラ再初期化ボタン */}
              <button 
                onClick={async () => {
                  console.log('カメラ再初期化を実行');
                  setCameraError(null);
                  
                  // 現在のストリームを停止
                  if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                  }
                  
                  // デバイス一覧をリセット
                  setDevices([]);
                  setSelectedDeviceId(null);
                  
                  // 少し待ってから再初期化
                  setTimeout(() => {
                    // 初期化useEffectを再トリガー
                    window.location.reload();
                  }, 500);
                }}
                style={{ 
                  padding: isMobile ? '8px 16px' : '5px 10px',
                  fontSize: isMobile ? '0.9rem' : '1rem',
                  backgroundColor: '#ff6b35'
                }}
              >
                🔄 カメラ再初期化
              </button>
              
              {isMobile && (
                <button 
                  onClick={toggleFullscreen}
                  style={{ 
                    padding: '8px 16px',
                    fontSize: '0.9rem',
                    backgroundColor: isFullscreen ? '#ff4444' : '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {isFullscreen ? '🔲 全画面終了' : '📱 横向き全画面'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: isMobile ? '10px' : '20px', 
        alignItems: 'center',
        marginTop: isFullscreen ? '0' : (isMobile ? '15px' : '20px'),
        width: '100%',
        height: isFullscreen ? '100%' : 'auto',
        justifyContent: isFullscreen ? 'center' : 'flex-start',
        position: 'relative'
      }}>
        {/* 全画面時のカメラアプリ風UI */}
        {isFullscreen && (
          <>
            {/* 横向き推奨メッセージ */}
            {showOrientationHint && (
              <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 0, 0, 0.9)',
                color: 'white',
                padding: '20px',
                borderRadius: '12px',
                textAlign: 'center',
                zIndex: 2000,
                fontSize: '16px',
                maxWidth: '300px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📱➡️📱</div>
                <div>横向きにすると</div>
                <div>より良い体験ができます</div>
              </div>
            )}

            {/* トップコントロールバー */}
            <div style={{
              position: 'fixed',
              top: '0',
              left: '0',
              right: '0',
              height: '60px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              zIndex: 1000,
              opacity: showControls ? 1 : 0,
              transition: 'opacity 0.3s ease',
              pointerEvents: showControls ? 'auto' : 'none'
            }}>
              {/* 左側：閉じるボタン */}
              <button 
                onClick={toggleFullscreen}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  color: 'white',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>

              {/* 中央：モード表示 */}
              <div style={{
                color: 'white',
                fontSize: '16px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span>🎨</span>
                <span>アニメフィルター</span>
              </div>

              {/* 右側：フィルター切り替え */}
              <button 
                onClick={() => setShowOriginal(!showOriginal)}
                style={{
                  background: showOriginal ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '8px 12px',
                  color: 'white',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {showOriginal ? '🎨 フィルター' : '📷 オリジナル'}
              </button>
            </div>

            {/* ボトムコントロールバー */}
            <div style={{
              position: 'fixed',
              bottom: '0',
              left: '0',
              right: '0',
              height: '120px',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              zIndex: 1000,
              opacity: showControls ? 1 : 0,
              transition: 'opacity 0.3s ease',
              pointerEvents: showControls ? 'auto' : 'none'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                maxWidth: '300px'
              }}>
                {/* 左：ギャラリー/設定 */}
                <button 
                  onClick={() => {/* TODO: ギャラリー機能 */}}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '12px',
                    width: '50px',
                    height: '50px',
                    color: 'white',
                    fontSize: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  🖼️
                </button>

                {/* 中央：シャッターボタン */}
                <button 
                  onClick={takeScreenshot}
                  style={{
                    background: 'white',
                    border: '4px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '50%',
                    width: '70px',
                    height: '70px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    transition: 'transform 0.1s ease',
                    boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)'
                  }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                  onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  📷
                </button>

                {/* 右：カメラ切り替え */}
                <button 
                  onClick={switchCamera}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '12px',
                    width: '50px',
                    height: '50px',
                    color: 'white',
                    fontSize: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: devices.length > 1 ? 1 : 0.5
                  }}
                  disabled={devices.length <= 1}
                >
                  🔄
                </button>
              </div>
            </div>

            {/* サイドコントロール（縦画面時） */}
            {isMobile && window.innerHeight > window.innerWidth && (
              <div style={{
                position: 'fixed',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                zIndex: 1000,
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.3s ease',
                pointerEvents: showControls ? 'auto' : 'none'
              }}>
                {/* ズーム調整（将来の拡張用） */}
                <button style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '45px',
                  height: '45px',
                  color: 'white',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}>
                  🔍
                </button>
                
                {/* タイマー（将来の拡張用） */}
                <button style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '45px',
                  height: '45px',
                  color: 'white',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}>
                  ⏲️
                </button>
              </div>
            )}
          </>
        )}
        
        <video 
          ref={videoRef} 
          style={{ 
            width: isFullscreen ? 
              (isMobile ? '100vw' : `${displaySize.width}px`) : 
              `${displaySize.width}px`, 
            height: isFullscreen ? 
              (isMobile ? '100vh' : `${displaySize.height}px`) : 
              `${displaySize.height}px`,
            objectFit: isFullscreen ? 'cover' : 'contain',
            maxWidth: '100%',
            maxHeight: isFullscreen && isMobile ? '100vh' : 'none',
            display: showOriginal && isFullscreen ? 'block' : 'none'
          }}
          autoPlay 
          playsInline 
          muted 
        />
        <canvas 
          ref={canvasRef}
          style={{ 
            width: isFullscreen ? 
              (isMobile ? '100vw' : `${displaySize.width}px`) : 
              `${displaySize.width}px`, 
            height: isFullscreen ? 
              (isMobile ? '100vh' : `${displaySize.height}px`) : 
              `${displaySize.height}px`,
            objectFit: isFullscreen ? 'cover' : 'contain',
            maxWidth: '100%',
            maxHeight: isFullscreen && isMobile ? '100vh' : 'none',
            display: showOriginal && isFullscreen ? 'none' : 'block'
          }}
        />
      </div>
    </div>
  );
}
