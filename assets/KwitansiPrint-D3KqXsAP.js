import"./rolldown-runtime-Dd_uD5pT.js";import{g as e,u as t}from"./index-D-PCXCXl.js";e();var n=t(),r=e=>new Intl.NumberFormat(`id-ID`,{style:`currency`,currency:`IDR`,minimumFractionDigits:0}).format(e),i=e=>{let t=[``,`Satu`,`Dua`,`Tiga`,`Empat`,`Lima`,`Enam`,`Tujuh`,`Delapan`,`Sembilan`,`Sepuluh`,`Sebelas`],n=``;return e<12?n=t[e]:e<20?n=i(e-10)+` Belas`:e<100?n=i(Math.floor(e/10))+` Puluh `+i(e%10):e<200?n=`Seratus `+i(e-100):e<1e3?n=i(Math.floor(e/100))+` Ratus `+i(e%100):e<2e3?n=`Seribu `+i(e-1e3):e<1e6?n=i(Math.floor(e/1e3))+` Ribu `+i(e%1e3):e<1e9?n=i(Math.floor(e/1e6))+` Juta `+i(e%1e6):e<0xe8d4a51000&&(n=i(Math.floor(e/1e9))+` Milyar `+i(e%1e9)),n.trim()},a=({order:e})=>{if(!e)return null;let t=new Date().toLocaleDateString(`id-ID`,{day:`numeric`,month:`long`,year:`numeric`}),a=e.shippingInfo?.shippedItems||[],o=[],s=[],c=0,l=0;if(a.length>0)e.items.forEach(e=>{let t=a.find(t=>t.name===e.name&&t.type===e.type);if(!t)return;let n=e.priceStudent||(e.priceKopkar||0)+(e.feeSchool||0);t.kopkarQty&&t.kopkarQty>0&&(o.push({...e,renderQty:t.kopkarQty}),c+=n*t.kopkarQty),t.vendorQty&&t.vendorQty>0&&(s.push({...e,renderQty:t.vendorQty}),l+=n*t.vendorQty)});else{let t=e.shippingInfo?.source===`vendor`;e.items.forEach(e=>{if(e.quantity>0){let n=e.priceStudent||(e.priceKopkar||0)+(e.feeSchool||0);t?(s.push({...e,renderQty:e.quantity}),l+=n*e.quantity):(o.push({...e,renderQty:e.quantity}),c+=n*e.quantity)}})}let u=o.length>0&&s.length>0,d=c+l>0?c+l:e.totalPriceStudent||0,f=e.items&&e.items.length>0?e.items.filter(e=>e.quantity>0).map(e=>`${e.name}${e.size?` (${e.size})`:``} [${e.quantity} pcs]`).join(`, `):e.id,p=e=>e.map((e,t)=>{let i=e.priceStudent||(e.priceKopkar||0)+(e.feeSchool||0),a=i*e.renderQty;return(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`center`},children:t+1}),(0,n.jsxs)(`td`,{style:{border:`1px solid #000`,padding:`2px`},children:[`[`,e.type,`] `,e.name]}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`center`},children:e.size||`-`}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`center`},children:e.renderQty}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`},children:r(i)}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`},children:r(a)})]},t)});return(0,n.jsxs)(`div`,{className:`print-only print-surat-jalan`,style:{margin:`0`,padding:`0`,width:`190mm`,boxSizing:`border-box`},children:[(0,n.jsx)(`style`,{children:`
    @media print {
      @page {
        margin: 5mm;
        size: auto;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
      }
      .sidebar,
      .topbar,
      .no-print,
      .ots-header,
      .ots-level-nav,
      .ots-grid-layout,
      .ots-history-section,
      .ots-container > *:not(.print-only):not(.print-surat-jalan) {
        display: none !important;
      }
      .print-only,
      .print-surat-jalan {
        display: block !important;
        font-family: 'Courier New', Courier, monospace !important;
        -webkit-font-smoothing: none;
        color: #000 !important;
        font-size: 13px !important;
        width: 190mm !important;
        margin: 0 auto !important;
      }
      .print-surat-jalan h1,
      .print-surat-jalan h2,
      .print-surat-jalan h3,
      .print-surat-jalan h4,
      .print-surat-jalan h5,
      .print-surat-jalan h6 {
        font-family: inherit !important;
      }
      .print-surat-jalan table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-surat-jalan table th, .print-surat-jalan table td {
        border: 1px solid #000 !important;
        font-size: 13px !important;
        padding: 2px 4px !important; 
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .print-surat-jalan table tr {
        page-break-inside: avoid; /* Jangan memotong baris setengah di lipatan kertas */
      }
    }
  `}),(0,n.jsxs)(`div`,{className:`print-header`,style:{display:`flex`,justifyContent:`space-between`,alignItems:`flex-start`,marginBottom:`6px`},children:[(0,n.jsxs)(`div`,{style:{display:`flex`,alignItems:`flex-start`,gap:`8px`},children:[(0,n.jsx)(`img`,{src:`/koperasiapp/logo_koperasi2.png`,alt:`Logo`,style:{width:`38px`,height:`auto`,filter:`grayscale(100%)`,marginTop:`2px`}}),(0,n.jsxs)(`div`,{children:[(0,n.jsx)(`h2`,{style:{margin:`0 0 4px 0`,fontSize:`14px`,fontWeight:`bold`},children:`KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA`}),(0,n.jsxs)(`div`,{style:{fontSize:`13px`,lineHeight:`1.2`},children:[`Kepada Yth,`,(0,n.jsx)(`br`,{}),`Bapak/Ibu `,(0,n.jsx)(`strong`,{children:e.schoolName}),(0,n.jsx)(`br`,{}),`di Tempat`]})]})]}),(0,n.jsx)(`div`,{style:{fontSize:`13px`,textAlign:`right`},children:(0,n.jsxs)(`div`,{children:[`Tanggal: `,t]})})]}),(0,n.jsxs)(`div`,{style:{textAlign:`center`,marginBottom:`6px`},children:[(0,n.jsx)(`h3`,{style:{margin:`0`,fontSize:`14px`,textDecoration:`underline`,fontWeight:`bold`},children:`Kwitansi`}),(0,n.jsxs)(`div`,{style:{fontSize:`13px`,marginTop:`2px`},children:[`No. Pesanan: `,e.id]})]}),(0,n.jsxs)(`div`,{style:{fontSize:`13px`,margin:`8px 0 10px 0`,lineHeight:`1.5`},children:[`Telah diterima uang `,(0,n.jsx)(`strong`,{children:r(d)}),` dari `,(0,n.jsx)(`strong`,{children:`..................................................`}),` untuk pemesanan `,(0,n.jsx)(`strong`,{children:f}),`.`]}),u?(0,n.jsxs)(n.Fragment,{children:[(0,n.jsxs)(`div`,{style:{marginBottom:`8px`},children:[(0,n.jsx)(`div`,{style:{fontSize:`13px`,fontWeight:`bold`,marginBottom:`2px`},children:`A. DIKIRIM DARI GUDANG KOPERASI`}),(0,n.jsxs)(`table`,{style:{width:`100%`,borderCollapse:`collapse`,fontSize:`13px`},children:[(0,n.jsx)(`thead`,{children:(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`5%`},children:`No`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`left`},children:`Nama Barang`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`10%`,textAlign:`center`},children:`Size`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`5%`,textAlign:`center`},children:`Qty`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`15%`,textAlign:`right`},children:`Harga`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`18%`,textAlign:`right`},children:`Jumlah`})]})}),(0,n.jsxs)(`tbody`,{children:[p(o),(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`td`,{colSpan:5,style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`,fontWeight:`bold`},children:`Sub-Total Koperasi`}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`,fontWeight:`bold`},children:r(c)})]})]})]})]}),(0,n.jsxs)(`div`,{style:{marginBottom:`8px`},children:[(0,n.jsx)(`div`,{style:{fontSize:`13px`,fontWeight:`bold`,marginBottom:`2px`},children:`B. DIKIRIM LANGSUNG DARI VENDOR PENJAHIT/PENERBIT`}),(0,n.jsxs)(`table`,{style:{width:`100%`,borderCollapse:`collapse`,fontSize:`13px`},children:[(0,n.jsx)(`thead`,{children:(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`5%`},children:`No`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`left`},children:`Nama Barang`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`10%`,textAlign:`center`},children:`Size`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`5%`,textAlign:`center`},children:`Qty`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`15%`,textAlign:`right`},children:`Harga`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`18%`,textAlign:`right`},children:`Jumlah`})]})}),(0,n.jsxs)(`tbody`,{children:[p(s),(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`td`,{colSpan:5,style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`,fontWeight:`bold`},children:`Sub-Total Vendor`}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`,fontWeight:`bold`},children:r(l)})]})]})]})]}),(0,n.jsxs)(`div`,{style:{fontSize:`13px`,fontWeight:`bold`,textAlign:`right`,marginBottom:`8px`,padding:`4px`,border:`1px solid #000`},children:[`TOTAL KESELURUHAN (A + B): `,r(d)]})]}):(0,n.jsx)(`div`,{style:{marginBottom:`4px`},children:(0,n.jsxs)(`table`,{style:{width:`100%`,borderCollapse:`collapse`,fontSize:`13px`},children:[(0,n.jsx)(`thead`,{children:(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`5%`},children:`No`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`left`},children:`Nama Barang`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`10%`,textAlign:`center`},children:`Size`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`5%`,textAlign:`center`},children:`Qty`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`15%`,textAlign:`right`},children:`Harga`}),(0,n.jsx)(`th`,{style:{border:`1px solid #000`,padding:`2px`,width:`18%`,textAlign:`right`},children:`Jumlah`})]})}),(0,n.jsxs)(`tbody`,{children:[p(o.length>0?o:s),(0,n.jsxs)(`tr`,{children:[(0,n.jsx)(`td`,{colSpan:5,style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`,fontWeight:`bold`},children:`Total Keseluruhan`}),(0,n.jsx)(`td`,{style:{border:`1px solid #000`,padding:`2px`,textAlign:`right`,fontWeight:`bold`},children:r(d)})]})]})]})}),(0,n.jsxs)(`div`,{style:{fontSize:`13px`,fontStyle:`italic`,marginBottom:`6px`,fontWeight:`bold`},children:[`Terbilang: `,i(d),` Rupiah`]}),(0,n.jsxs)(`div`,{style:{fontSize:`13px`,marginBottom:`8px`,pageBreakInside:`avoid`},children:[(0,n.jsx)(`strong`,{children:`Catatan:`}),(0,n.jsxs)(`ol`,{style:{margin:`2px 0 0 0`,paddingLeft:`16px`,lineHeight:`1.2`},children:[(0,n.jsx)(`li`,{children:`Mohon lembar 1(Putih) disimpan sebagai bukti pembayaran`}),(0,n.jsx)(`li`,{children:`Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur`})]})]}),(0,n.jsxs)(`div`,{style:{display:`flex`,justifyContent:`space-between`,fontSize:`13px`,marginTop:`16px`,pageBreakInside:`avoid`},children:[(0,n.jsxs)(`div`,{style:{textAlign:`center`,width:`140px`},children:[(0,n.jsx)(`div`,{children:`Diterima oleh,`}),(0,n.jsx)(`div`,{style:{marginTop:`30px`,borderBottom:`1px solid #000`}})]}),(0,n.jsxs)(`div`,{style:{textAlign:`center`,width:`140px`},children:[(0,n.jsx)(`div`,{children:`Pengirim / Kasir,`}),(0,n.jsx)(`div`,{style:{marginTop:`30px`,borderBottom:`1px solid #000`}}),(0,n.jsx)(`div`,{style:{marginTop:`2px`},children:`Sri Mulyani`})]})]})]})};export{a as t};