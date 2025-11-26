import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="sticky top-0 z-50 glass-card backdrop-blur-md border-b border-white/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand */}
          <Link 
            to="/" 
            className="text-2xl font-bold text-blue-600 hover:text-blue-700 transition-colors duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg px-2 py-1"
          >
            MediScan AI
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className={`px-3 py-2 rounded-lg text-base font-medium transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                isActive('/') 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              Home
            </Link>
            
            {user ? (
              <>
                <Link
                  to="/upload"
                  className={`px-3 py-2 rounded-lg text-base font-medium transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    isActive('/upload') 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Upload
                </Link>
                <Link
                  to="/history"
                  className={`px-3 py-2 rounded-lg text-base font-medium transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    isActive('/history') 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  History
                </Link>
                <div className="flex items-center space-x-4">
                  <span className="text-gray-700 text-base">
                    Welcome, {user.name}
                  </span>
                  <button
                    onClick={logout}
                    className="text-gray-700 hover:text-red-600 px-3 py-2 rounded-lg text-base font-medium transition-all duration-300 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`px-3 py-2 rounded-lg text-base font-medium transition-all duration-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    isActive('/login') 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="btn-primary"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="text-gray-700 hover:text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg p-2">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
