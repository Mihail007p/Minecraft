package com.mcclassic.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.IOException;
import java.io.InputStream;

/**
 * Minecraft Classic — Android-обёртка (WebView).
 *
 * Вся игра — один офлайн-файл в assets. Он отдаётся через виртуальный https-origin,
 * поэтому прогресс (инвентарь, снаряжение, сюжет) сохраняется между запусками
 * в localStorage, и приложение работает без интернета.
 *
 * Что делает обёртка:
 *  - полноэкранный режим (immersive) и всегда включённый экран;
 *  - при сворачивании приложения игра получает событие «страница скрыта» и
 *    сохраняет инвентарь (тот же путь, что и при закрытии вкладки в Chrome);
 *  - кнопка «Назад»: закрывает открытые панели (инвентарь, верстак, печь,
 *    торговлю, чат, песочницу), иначе выходит из игры;
 *  - прячет кнопки, которые нужны только в браузере (установка на рабочий стол
 *    и переключение полного экрана);
 *  - наружу никуда не уходит: нет разрешения INTERNET и запрещены переходы.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://minecraft.local/";
    private static final String ASSET = "minecraft.html";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        goFullscreen();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ORIGIN)) {
                    String path = url.substring(ORIGIN.length());
                    int q = path.indexOf('?');
                    if (q >= 0) path = path.substring(0, q);
                    if (path.isEmpty() || path.equals("/")) path = ASSET;
                    path = path.replace("../", "");
                    try {
                        InputStream in = getAssets().open(path);
                        return new WebResourceResponse("text/html", "utf-8", in);
                    } catch (IOException e) {
                        return new WebResourceResponse("text/plain", "utf-8", null);
                    }
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                /* игра самодостаточна: наружу не уходим */
                return !request.getUrl().toString().startsWith(ORIGIN);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                /* кнопки браузерной установки и своего фуллскрина в приложении не нужны:
                   полный экран и так системный, а «установить» заменяет установка APK */
                view.evaluateJavascript(
                        "(function(){['install-banner','install-help','install-action','install-close'," +
                                "'btn-fullscreen','fs-icon-enter','fs-icon-exit'].forEach(function(id){" +
                                "var e=document.getElementById(id);" +
                                "if(e){ if(e.parentNode) e.parentNode.removeChild(e); }});" +
                                "return 'cleaned';})()", null);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                return true;                       // не засоряем logcat
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        loadGame();
    }

    private void loadGame() {
        try {
            getAssets().open(ASSET).close();
            web.loadUrl(ORIGIN + ASSET);
        } catch (IOException e) {
            web.loadDataWithBaseURL(ORIGIN, "<h2 style='color:#fff;font-family:sans-serif'>"
                    + "Файл игры не найден в сборке.<br>Он должен лежать в "
                    + "android/app/src/main/assets/minecraft.html</h2>", "text/html", "utf-8", null);
        }
    }

    private void goFullscreen() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullscreen();
    }

    /** Игра сохраняет мир по событию «страница скрыта» — зовём его вручную. */
    private void setHidden(boolean hidden) {
        web.evaluateJavascript(
                "(function(){try{" +
                        "Object.defineProperty(document,'hidden',{value:" + hidden + ",configurable:true});" +
                        "Object.defineProperty(document,'visibilityState',{value:'" + (hidden ? "hidden" : "visible") + "',configurable:true});" +
                        "document.dispatchEvent(new Event('visibilitychange'));" +
                        "window.dispatchEvent(new Event('" + (hidden ? "pagehide" : "pageshow") + "'));" +
                        "return 'ok';}catch(e){return 'err';}})()", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web == null) return;
        setHidden(true);
        /* даём JS выполниться, затем останавливаем WebView (иначе не сохранится) */
        if (web != null) {
            web.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (web != null) web.onPause();
                }
            }, 250);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            setHidden(false);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            if (isFinishing()) setHidden(true);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web != null) {
                /* закрываем открытые панели, иначе выходим из приложения */
                web.evaluateJavascript(
                        "(function(){try{" +
                                "function visible(id){var e=document.getElementById(id);" +
                                " if(!e) return false; var st=window.getComputedStyle(e);" +
                                " return st.display!=='none' && st.visibility!=='hidden' && st.opacity!=='0';}" +
                                "var pairs=[['inv-overlay','inv-close'],['trade-overlay','trade-close']," +
                                "['chat-overlay','chat-close'],['sandbox-overlay','sandbox-close']];" +
                                "for(var i=0;i<pairs.length;i++){ if(visible(pairs[i][0])){" +
                                " var b=document.getElementById(pairs[i][1]);" +
                                " if(b){ b.click(); return 'handled'; } } }" +
                                "var d=document.getElementById('death-screen');" +
                                "if(d && window.getComputedStyle(d).display!=='none'){ return 'exit'; }" +
                                "return 'exit';}catch(e){return 'exit';}})()",
                        new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                if (value != null && value.contains("exit")) {
                                    setHidden(true);
                                    finish();
                                }
                            }
                        });
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
