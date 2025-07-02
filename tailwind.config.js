/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
  		borderRadius: {
  			lg: 'var(--radius-lg)',
  			md: 'var(--radius-md)',
  			sm: 'var(--radius-sm)',
        xs: 'var(--radius-xs)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
        lighter: 'hsl(var(--primary-lighter))',
        darker: 'hsl(var(--primary-darker))',
        accent: 'hsl(var(--primary-accent))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
        darker: 'hsl(var(--secondary-darker))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
        success: {
          DEFAULT: 'hsl(var(--success))',
          lighter: 'hsl(var(--success-lighter))',
          bg: 'hsl(var(--success-bg))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          lighter: 'hsl(var(--warning-lighter))',
          bg: 'hsl(var(--warning-bg))'
        },
        error: {
          DEFAULT: 'hsl(var(--error))',
          lighter: 'hsl(var(--error-lighter))',
          bg: 'hsl(var(--error-bg))'
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          lighter: 'hsl(var(--info-lighter))',
          bg: 'hsl(var(--info-bg))'
        },
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
      boxShadow: {
        'premium': 'var(--shadow-lg)',
        'glow-primary': '0 0 20px rgba(59, 130, 246, 0.15), 0 8px 32px rgba(59, 130, 246, 0.1)',
        'glow-success': '0 0 20px rgba(5, 150, 105, 0.15), 0 8px 32px rgba(5, 150, 105, 0.1)',
        'glow-warning': '0 0 20px rgba(245, 158, 11, 0.15), 0 8px 32px rgba(245, 158, 11, 0.1)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.15), 0 8px 32px rgba(239, 68, 68, 0.1)',
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '800': '800ms',
        '1000': '1000ms',
      },
      transitionTimingFunction: {
        'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backgroundImage: {
        'gradient-radial': 'var(--gradient-radial)',
        'gradient-mesh': 'var(--gradient-mesh)',
        'grid-pattern': 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '20px 20px',
      },
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
        'float-gentle': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        'pulse-glow': {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
            transform: 'scale(1)'
          },
          '50%': { 
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.6)',
            transform: 'scale(1.02)'
          }
        },
        'shimmer-premium': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
        'float-gentle': 'float-gentle 4s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'shimmer': 'shimmer-premium 2s infinite',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-down': 'slide-down 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}