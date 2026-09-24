export type UserRole = 'admin' | 'kopkar' | 'sekolah' | 'pengurus';

export type SchoolLevel = 'TK' | 'SD' | 'SMP' | 'SMA' | 'SEMUA';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  schoolName?: string; // Hanya untuk role 'sekolah'
  schoolLevel?: SchoolLevel; // Jenjang: TK, SD, SMP, SMA
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

// --- Master Produk & Harga ---

export type OrderItemType = 'seragam' | 'buku';

export interface ProductItem {
  id: string;
  code: string;            // Contoh: SRG-SMP-01, BK-SD-02
  name: string;            // Nama barang
  category: OrderItemType; // seragam / buku
  level: SchoolLevel;      // TK / SD / SMP / SMA / SEMUA
  priceKopkar: number;     // Harga Koperasi (HPP/Modal)
  feeSchool: number;       // Fee Sekolah (Margin Hak Sekolah)
  priceStudent: number;    // Harga Siswa = priceKopkar + feeSchool
  stock: number;           // Jumlah stok fisik di koperasi
  minStock?: number;       // Batas minimum stok
  size?: string;           // Ukuran
  storageLocation?: string; // Lokasi Penyimpanan
}

// --- Order System ---

export type OrderStatus =
  | 'pending'                  // Menunggu persetujuan Koperasi
  | 'approved'                 // Disetujui Koperasi (siap dikirim)
  | 'shipped'                  // Barang sedang dikirim oleh Koperasi
  | 'received'                 // Barang telah diterima & dicek oleh Sekolah
  | 'cancellation_requested'   // Sekolah mengajukan pembatalan (menunggu approval Koperasi)
  | 'cancelled'                // Pesanan dibatalkan (oleh Koperasi atau disetujui dari permohonan Sekolah)
  | 'rejected';                // Ditolak awal oleh Koperasi

// Status Keuangan & Pelunasan
export type PaymentStatus = 'unpaid' | 'paid'; // Pelunasan pembayaran dari sekolah ke koperasi
export type FeeStatus = 'locked' | 'ready' | 'disbursed'; // Status pencairan fee sekolah

export interface OrderItem {
  productId?: string;
  code?: string;
  name: string;
  type: OrderItemType;
  quantity: number;
  priceKopkar: number;     // Harga Koperasi satuan
  feeSchool: number;       // Fee Sekolah satuan
  priceStudent: number;    // Harga Siswa satuan (Kopkar + Fee)
}

export interface ShippingInfo {
  shippedAtDate: string;  // Contoh: '2026-09-17'
  shippedAtTime: string;  // Contoh: '10:30'
  courierNotes?: string;  // Contoh: 'Mobil Box Koperasi Plat B 1234 CD - Sopir Pak Joko'
  shippedBy: string;      // Nama staf Koperasi yang menginput kirim
  shippedItems?: { name: string; type: string; shippedQty: number }[]; // Track partial shipments
}

export interface ReceiveInfo {
  receivedAt: string;     // ISO timestamp penerimaan
  receivedBy: string;     // Nama petugas sekolah yang menerima
  isChecked: boolean;     // Checklist verifikasi kondisi & kuantiti fisik
  notes?: string;         // Catatan saat penerimaan barang
}

export interface CancellationInfo {
  cancelledByRole: 'sekolah' | 'kopkar';
  cancelledByName: string;
  reason: string;
  cancelledAt: string;    // ISO timestamp pembatalan resmi
  requestedAt?: string;   // ISO timestamp jika diawali permohonan sekolah
}

export interface Order {
  id: string;
  schoolUserId: string;   // ID of the school user who created this order
  schoolName: string;      // Name of the school
  schoolLevel?: SchoolLevel; // Jenjang sekolah pemesan (TK/SD/SMP/SMA)
  orderPhase?: 'Tahap 1' | 'Tahap 2' | 'Tambahan';
  items: OrderItem[];
  status: OrderStatus;
  notes: string;           // Notes from school
  createdAt: string;

  // Financial Breakdown
  totalPriceKopkar: number;  // Total Modal Koperasi (Rp)
  totalFeeSchool: number;    // Total Fee Sekolah (Rp)
  totalPriceStudent: number; // Total Tagihan Siswa (Rp)

  // Status Pelunasan Pembayaran Sekolah -> Koperasi
  paymentStatus: PaymentStatus;
  paidAt?: string;
  paidNotes?: string;

  // Status Pencairan Fee Sekolah Koperasi -> Sekolah
  feeStatus: FeeStatus;
  feeDisbursedAt?: string;
  feeDisbursedBy?: string;
  feeDisbursedNotes?: string;

  // Approval/Rejection info
  processedBy?: string;
  processedAt?: string;
  rejectionReason?: string;

  // Shipping info
  shippingInfo?: ShippingInfo;

  // Receive info
  receiveInfo?: ReceiveInfo;

  // Cancellation info
  cancellationInfo?: CancellationInfo;
}

// --- Retur Barang System ---

export type ReturnStatus = 'requested' | 'in_transit' | 'accepted' | 'rejected';

export interface ReturnItem {
  productId?: string;
  productCode?: string;
  productName: string;
  quantity: number;
  itemReason?: string;
}

export interface ReturnRequest {
  id: string;
  schoolUserId: string;
  schoolName: string;
  schoolLevel?: SchoolLevel;
  items: ReturnItem[];
  reasonCategory?: string;    // Kategori alasan: Rusak, Cacat Jahitan, Salah Ukuran, Kelebihan, dll
  reason: string;             // Alasan retur detail
  departureDate: string;      // Tanggal keberangkatan barang (YYYY-MM-DD)
  departureTime: string;      // Jam keberangkatan barang (HH:mm)
  shippingNote?: string;      // Catatan pengiriman/armada/sopir
  status: ReturnStatus;
  createdAt: string;          // ISO timestamp pengajuan
  // Filled when accepted
  acceptedAt?: string;
  acceptedAtDate?: string;    // Tanggal penerimaan fisik di koperasi (YYYY-MM-DD)
  acceptedAtTime?: string;    // Jam penerimaan fisik di koperasi (HH:mm)
  acceptedByName?: string;    // Nama staf koperasi yang menerima
  acceptedNotes?: string;     // Catatan verifikasi fisik barang oleh koperasi
  isRestocked?: boolean;      // Apakah barang dimasukkan kembali ke stok fisik
  // Filled when rejected
  rejectedAt?: string;
  rejectedByName?: string;
  rejectionReason?: string;
}
