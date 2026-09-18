package com.nitrorush.game;

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
 * NITRO RUSH — WebView shell.
 *
 * The whole game is a single offline HTML file inside assets. It is served
 * through a virtual https origin (so that localStorage keeps the player's
 * progress between runs) and rendered by the system WebView.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://nitrorush.local/";
    private static final String ASSET = "nitrorush.html";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
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
                /* the game is self-contained: never navigate away */
                return !request.getUrl().toString().startsWith(ORIGIN);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                return true;                       // keep the logcat clean
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        loadGame();
    }

    private void loadGame() {
        try {
            /* verify the asset exists before pointing the WebView at it */
            getAssets().open(ASSET).close();
            web.loadUrl(ORIGIN + ASSET);
        } catch (IOException e) {
            web.loadDataWithBaseURL(ORIGIN, "<h2 style='color:#fff;font-family:sans-serif'>"
                    + "Файл игры не найден в сборке.<br>Постройте его: node tools/build-offline.js --android</h2>",
                    "text/html", "utf-8", null);
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

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            /* pause the race when the app goes to the background */
            web.evaluateJavascript(
                    "window.NR && NR.App && NR.App.pauseRace ? (NR.App.pauseRace(), 'paused') : 'idle'", null);
            web.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web != null) {
                web.evaluateJavascript(
                        "(function(){try{ if(!window.NR||!NR.App) return 'exit';" +
                                " if(document.getElementById('s-settings').classList.contains('on')){ NR.App.settingsFrom='menu';" +
                                "  document.getElementById('s-settings').classList.remove('on'); return 'handled'; }" +
                                " if(NR.App.state==='race'){ NR.App.pauseRace(); return 'handled'; }" +
                                " if(NR.App.state==='paused'){ NR.App.quitToMenu(); return 'handled'; }" +
                                " if(NR.App.state==='results'){ NR.App.quitToMenu(); return 'handled'; }" +
                                " if(NR.App.state==='menu'){ return 'exit'; }" +
                                " NR.App.openMenu(); return 'handled'; }catch(e){ return 'exit'; }})()",
                        new ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String value) {
                                if (value != null && value.contains("exit")) finish();
                            }
                        });
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
