package com.brokly.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.telephony.TelephonyManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Native Android call-end detector for Brokly CRM.
 * Listens to TelephonyManager.ACTION_PHONE_STATE_CHANGED + NEW_OUTGOING_CALL,
 * captures duration + phone number, queries CallLog for authoritative duration,
 * and fires a JS event "callEnded" that the frontend auto-posts to /api/call-log.
 *
 * Permissions: READ_PHONE_STATE + READ_CALL_LOG (declared in AndroidManifest.xml,
 * requested at runtime via requestPermissions()).
 */
@CapacitorPlugin(
    name = "CallTracker",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_PHONE_STATE }, alias = "phone"),
        @Permission(strings = { Manifest.permission.READ_CALL_LOG }, alias = "callLog")
    }
)
public class CallTrackerPlugin extends Plugin {

    private BroadcastReceiver phoneStateReceiver;
    private BroadcastReceiver outgoingCallReceiver;
    private long callStartTime = 0;
    private String dialedNumber = "";
    private boolean wasOffhook = false;

    @Override
    public void load() {
        super.load();
        registerReceivers();
    }

    private void registerReceivers() {
        Context ctx = getContext();

        // Listen for outgoing dial (captures number before state changes)
        outgoingCallReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_NEW_OUTGOING_CALL.equals(intent.getAction())) {
                    String num = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER);
                    if (num != null && !num.isEmpty()) {
                        dialedNumber = num;
                    }
                }
            }
        };
        IntentFilter outgoingFilter = new IntentFilter(Intent.ACTION_NEW_OUTGOING_CALL);
        ctx.registerReceiver(outgoingCallReceiver, outgoingFilter);

        // Listen for phone state changes
        phoneStateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;

                String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
                String incoming = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);

                if (incoming != null && !incoming.isEmpty()) {
                    dialedNumber = incoming;
                }

                if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
                    // Call answered / dialing started
                    if (callStartTime == 0) {
                        callStartTime = System.currentTimeMillis();
                        wasOffhook = true;
                    }
                } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
                    // Call ended — wasOffhook ensures we don't fire on mere ringing
                    if (wasOffhook && callStartTime != 0) {
                        long durationMs = System.currentTimeMillis() - callStartTime;
                        long durationSec = Math.max(0, durationMs / 1000);
                        // Prefer authoritative duration from CallLog (includes exact billing seconds)
                        JSObject callLogInfo = queryLastCallLog();
                        String number = dialedNumber;
                        long logDuration = durationSec;
                        if (callLogInfo != null) {
                            String logNum = callLogInfo.getString("number");
                            Integer logDur = callLogInfo.getInteger("duration");
                            if (logNum != null && !logNum.isEmpty()) number = logNum;
                            if (logDur != null) logDuration = logDur;
                        }
                        JSObject ret = new JSObject();
                        ret.put("phoneNumber", number != null ? number : "");
                        ret.put("duration", logDuration);
                        ret.put("rawDurationMs", durationMs);
                        ret.put("startTime", callStartTime);
                        ret.put("endTime", System.currentTimeMillis());
                        ret.put("callLog", callLogInfo);
                        notifyListeners("callEnded", ret, true);
                    }
                    // Reset for next call
                    callStartTime = 0;
                    dialedNumber = "";
                    wasOffhook = false;
                } else if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
                    // Ringing — store number but don't start timer yet
                    if (incoming != null) dialedNumber = incoming;
                }
            }
        };
        IntentFilter filter = new IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED);
        ctx.registerReceiver(phoneStateReceiver, filter);
    }

    // Query the most recent CallLog entry for authoritative number/duration
    private JSObject queryLastCallLog() {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[]{ CallLog.Calls.NUMBER, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.DATE },
                null, null,
                CallLog.Calls.DATE + " DESC LIMIT 1"
            );
            if (cursor != null && cursor.moveToFirst()) {
                JSObject obj = new JSObject();
                String num = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER));
                int dur = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION));
                int type = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE));
                long date = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE));
                obj.put("number", num);
                obj.put("duration", dur);
                obj.put("type", type);
                obj.put("date", date);
                return obj;
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return null;
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        super.requestPermissions(call);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        boolean phone = hasPermission(Manifest.permission.READ_PHONE_STATE);
        boolean log = hasPermission(Manifest.permission.READ_CALL_LOG);
        ret.put("phone", phone ? "granted" : "prompt");
        ret.put("callLog", log ? "granted" : "prompt");
        ret.put("allGranted", phone && log);
        call.resolve(ret);
    }

    @PluginMethod
    public void getLastCall(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            call.reject("READ_CALL_LOG permission not granted");
            return;
        }
        JSObject info = queryLastCallLog();
        if (info == null) {
            call.reject("No call log found");
            return;
        }
        call.resolve(info);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (phoneStateReceiver != null) getContext().unregisterReceiver(phoneStateReceiver);
            if (outgoingCallReceiver != null) getContext().unregisterReceiver(outgoingCallReceiver);
        } catch (Exception ignored) {}
        super.handleOnDestroy();
    }
}
