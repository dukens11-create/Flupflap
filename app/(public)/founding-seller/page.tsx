import { FoundingSellerPromo } from '@/components/FoundingSellerPromo';

export default function FoundingSellerPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">FlupFlap Founding Seller Program</h1>
          <p className="text-xl text-gray-600">Join our elite group of first 1,000 sellers and build your business free for a year</p>
        </div>

        <FoundingSellerPromo />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-bold text-gray-900 mb-4">📋 What You Get</h3>
            <ul className="space-y-3 text-gray-700">
              <li>• Free seller subscription for 12 months</li>
              <li>• List unlimited products</li>
              <li>• Host garage sales events</li>
              <li>• Go live with video streaming</li>
              <li>• Access full seller dashboard</li>
              <li>• Community support</li>
            </ul>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-bold text-gray-900 mb-4">💰 Pricing After Year 1</h3>
            <div className="space-y-4 text-gray-700">
              <div>
                <p className="font-semibold">Garage Seller</p>
                <p className="text-lg text-green-600 font-bold">$3.99/month</p>
              </div>
              <div>
                <p className="font-semibold">Regular Seller</p>
                <p className="text-lg text-green-600 font-bold">$4.99/month</p>
              </div>
              <p className="text-sm text-gray-500 mt-4">Plus 7% selling fee on each successful sale</p>
            </div>
          </div>
        </div>

        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">🎯 Limited to First 1,000 Founders</h3>
          <p className="text-gray-700 mb-4">
            This exclusive offer is only available to the first 1,000 sellers who join FlupFlap. Once the limit is reached, enrollment closes and future sellers will have access to our standard subscription plans.
          </p>
          <p className="text-gray-600 italic">
            Your paid subscription will not begin automatically unless you choose to subscribe after your free year ends.
          </p>
        </div>
      </div>
    </div>
  );
}
