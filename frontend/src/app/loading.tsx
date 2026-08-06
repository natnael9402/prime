export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--bg-rgb))] overflow-hidden">
      <div className="flex flex-col items-center">
        <div className="relative flex items-center gap-2 text-5xl md:text-6xl font-black tracking-tighter">
          <div className="relative">
            <span className="text-[rgb(var(--text-1))]">Prime</span>
            <span className="prime-sweep absolute inset-0 text-transparent bg-clip-text">Prime</span>
          </div>
          <div className="relative">
            <span className="text-[#00E065]">Store</span>
            <span className="store-glow absolute inset-0 text-transparent bg-clip-text">Store</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="green-burst"></div>
      </div>

      <style>{`
        .prime-sweep {
          background-image: linear-gradient(
            120deg,
            transparent 0%,
            transparent 40%,
            rgb(var(--text-1)) 50%,
            transparent 60%,
            transparent 100%
          );
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          animation: sweep 2.5s infinite linear;
          opacity: 0.9;
        }

        .store-glow {
          background-image: linear-gradient(
            120deg,
            transparent 0%,
            transparent 40%,
            #7DFFB0 50%,
            transparent 60%,
            transparent 100%
          );
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          animation: sweep 2.5s infinite linear;
          animation-delay: 0.2s;
          opacity: 1;
          filter: drop-shadow(0 0 15px #00E065) brightness(1.2);
        }

        .green-burst {
          width: 200vw;
          height: 1px;
          background: #00E065;
          box-shadow: 0 0 60px 20px #00E065;
          opacity: 0;
          transform: rotate(-20deg) scaleX(0);
          animation: burst-line 3.5s infinite ease-in-out;
        }

        @keyframes sweep {
          0% { background-position: 100% 50%; }
          100% { background-position: -50% 50%; }
        }

        @keyframes burst-line {
          0% { opacity: 0; transform: rotate(-20deg) scaleX(0); }
          50% { opacity: 0.12; transform: rotate(-20deg) scaleX(1); }
          100% { opacity: 0; transform: rotate(-20deg) scaleX(0); }
        }
      `}</style>
    </div>
  );
}
