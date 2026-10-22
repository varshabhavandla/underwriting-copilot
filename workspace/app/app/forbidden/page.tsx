export const dynamic = "force-dynamic";

export default function Forbidden() {
  return (
    <main>
      <h1>No access</h1>
      <p>Sign-in did not complete, or your account is not permitted to do this. If you expected access, ask your administrator.</p>
      <p><a href="/review">Back to the review queue</a></p>
    </main>
  );
}
