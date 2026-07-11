import React from 'react';

interface FoundingSellerProgramProps {
  onBecomeSeller?: () => void;
}

export const FoundingSellerProgram: React.FC<FoundingSellerProgramProps> = ({
  onBecomeSeller,
}) => {
  return (
    <div className="founding-seller-program bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            🚀 FlupFlap Founding Seller Program
          </h1>
          <p className="text-3xl font-semibold text-blue-600 mb-4">
            SELL FREE FOR 1 FULL YEAR
          </p>
          <p className="text-xl text-gray-700">
            Join FlupFlap Marketplace as one of our first 1,000 Founding Sellers and receive
            your seller subscription FREE for 12 months.
          </p>
        </div>

        {/* Main Benefits */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">What You Get</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">No subscription payment for 1 year</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">No credit card required to start</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">List and sell products</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">Host Garage Sales</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">Go Live with Garage Sales Live</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">Access your Seller Dashboard</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">Keep building your business</span>
            </li>
            <li className="flex items-start">
              <span className="text-2xl mr-3">✓</span>
              <span className="text-lg text-gray-700">Grow with FlupFlap</span>
            </li>
          </ul>
        </div>

        {/* Pricing Structure */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Current */}
          <div className="bg-blue-50 rounded-lg p-8 border-2 border-blue-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">For 12 Months</h3>
            <p className="text-gray-700 mb-4">
              FlupFlap charges a <strong>7% selling fee only when you successfully make a sale.</strong>
            </p>
            <p className="text-sm text-gray-600">
              No monthly subscription required during your founding year!
            </p>
          </div>

          {/* After Free Year */}
          <div className="bg-gray-50 rounded-lg p-8 border-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">After Your Free Year</h3>
            <div className="space-y-2 mb-4">
              <p className="text-gray-700">
                <strong>Garage Seller</strong> — $3.99/month
              </p>
              <p className="text-gray-700">
                <strong>Regular Seller</strong> — $4.99/month
              </p>
            </div>
            <p className="text-sm text-gray-600">
              Your paid subscription will not begin automatically unless you choose to subscribe.
            </p>
          </div>
        </div>

        {/* Limitation */}
        <div className="bg-yellow-50 rounded-lg p-6 mb-12 border-l-4 border-yellow-400">
          <p className="text-lg font-bold text-gray-900">
            ⏰ LIMITED TO THE FIRST 1,000 FOUNDING SELLERS
          </p>
          <p className="text-gray-700 mt-2">
            Join now to secure your spot in this exclusive program.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900 mb-6">
            JOIN FREE. LIST YOUR PRODUCTS. GO LIVE. START SELLING.
          </p>
          <button
            onClick={onBecomeSeller}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-12 rounded-lg text-lg transition duration-200 transform hover:scale-105"
          >
            BECOME A FOUNDING SELLER
          </button>
        </div>
      </div>
    </div>
  );
};

export default FoundingSellerProgram;