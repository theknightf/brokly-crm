'use client';
import React from 'react';
import LoginForm from './LoginForm';
import AuthBrandPanel from './AuthBrandPanel';

export default function AuthScreen() {
  return (
    <div className="min-h-screen flex">
      {/* Brand panel — hidden on mobile */}
      <AuthBrandPanel />

      {/* Form panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background min-h-screen">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L18 9H15V18H5V9H2L10 2Z" fill="white" />
              </svg>
            </div>
            <span className="font-bold text-xl text-foreground">RealtyFlow</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Log in to your account to continue</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
