package com.avkiller.syncclipboardmobile.processtext

import android.content.res.Configuration
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import com.jericx.syncclipboardmobile.BuildConfig
import expo.modules.ReactActivityDelegateWrapper

/**
 * Transparent Activity for Android "Process Text" floating toolbar action.
 * Receives the selected text via PROCESS_TEXT intent and renders
 * a semi-transparent overlay for uploading without showing the main app UI.
 * Reuses QuickActionApp component with text parameter.
 */
class ProcessTextActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
    }

    override fun getMainComponentName(): String = "quickAction"

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            object : DefaultReactActivityDelegate(
                this,
                mainComponentName,
                fabricEnabled
            ) {
                override fun getLaunchOptions(): Bundle? {
                    val isDarkMode = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
                    val text = intent?.getCharSequenceExtra(android.content.Intent.EXTRA_PROCESS_TEXT)?.toString() ?: ""
                    return Bundle().apply {
                        putString("text", text)
                        putString("systemTheme", if (isDarkMode) "dark" else "light")
                    }
                }
            }
        )
    }
}
